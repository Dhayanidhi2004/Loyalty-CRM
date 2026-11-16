const router = require('express').Router();
const { one, query, tx } = require('../db');
const { requireAuth } = require('../auth');
const { modules, CONVERTED, NOT_CONVERTED } = require('../modules');
const { levelFor, can } = require('../roles');
const { localDayRange, localDateToISO, generateNumber, financialYear, EMAIL_RE, ah } = require('../utils');
const notify = require('../notifications');

// Notifications must never make a save fail.
const safely = (fn) => fn().catch((e) => console.error('notification failed:', e.message));

router.use(requireAuth);
router.param('id', (req, res, next, id) => (/^\d+$/.test(id) ? next() : res.status(404).json({ message: 'Record not found' })));

// Resolves the module and the caller's access level for it (see roles.js).
function getModule(req, res) {
  const mod = modules[req.params.module];
  if (!mod) {
    res.status(404).json({ message: `Unknown module "${req.params.module}"` });
    return {};
  }
  const level = levelFor(req.user, req.params.module);
  if (!can.read(level)) {
    res.status(403).json({ message: `Your role doesn't have access to ${mod.label}` });
    return {};
  }
  return { mod, level };
}

function shape(row) {
  return {
    ...row.data,
    id: row.id,
    module: row.module,
    status: row.status,
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? null,
    createdByCode: row.created_by_code ?? null,
    createdByEmail: row.created_by_email ?? null,
    assignedToName: row.assigned_to_name ?? null,
    assignedToCode: row.assigned_to_code ?? null,
    salesHeadName: row.sales_head_name ?? null,
    salesHeadCode: row.sales_head_code ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    statusChangedAt: row.status_changed_at,
  };
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const toNum = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

// Line items: keep the configured columns, coerce numbers, work out the line total.
function cleanItems(field, list, errors) {
  if (!Array.isArray(list)) {
    errors.push(`${field.label} must be a list`);
    return [];
  }
  const { columns, lineTotal } = field;
  return list
    .map((raw) => {
      const item = {};
      for (const c of columns) {
        if (c.computed) continue;
        if (c.type === 'number' || c.type === 'currency') {
          const n = toNum(raw?.[c.key]);
          if (n !== null && (Number.isNaN(n) || n < 0)) errors.push(`${field.label}: ${c.formLabel || c.label} must be a positive number`);
          item[c.key] = Number.isNaN(n) ? null : n;
        } else {
          item[c.key] = String(raw?.[c.key] ?? '').trim();
        }
      }
      if (lineTotal) item[lineTotal.key] = round2((item[lineTotal.qty] || 0) * (item[lineTotal.price] || 0));
      return item;
    })
    .filter((item) => columns.some((c) => !c.computed && item[c.key] !== '' && item[c.key] !== null && item[c.key] !== 0))
    .slice(0, 200);
}

// Keep only known fields, coerce numbers, check required ones.
function clean(mod, body, { partial = false } = {}) {
  const data = {};
  const errors = [];
  for (const f of mod.fields) {
    if (f.computed) continue;
    const autoFilled = !!f.autoNumber;
    if (!(f.key in body)) {
      if (!partial && f.required && !autoFilled) errors.push(`${f.formLabel || f.label} is required`);
      continue;
    }
    if (f.type === 'items') {
      data[f.key] = cleanItems(f, body[f.key], errors);
      continue;
    }
    let v = body[f.key];
    if (typeof v === 'string') v = v.trim();
    if (v === '' || v === undefined) v = null;
    if (v !== null && (f.type === 'number' || f.type === 'currency')) {
      const n = Number(v);
      if (Number.isNaN(n)) errors.push(`${f.formLabel || f.label} must be a number`);
      else v = n;
    }
    if (v !== null && f.type === 'employee') {
      // stored as the employee's numeric id; existence is checked in checkAssignee()
      if (!/^\d+$/.test(String(v))) errors.push(`${f.label} is not a valid employee`);
      else v = Number(v);
    }
    if (v !== null && f.type === 'email' && !EMAIL_RE.test(v)) errors.push(`${f.label} is not a valid email`);
    if (v !== null && f.type === 'select' && f.options && !f.options.includes(v)) errors.push(`${f.label} has an invalid value`);
    if (v === null && f.required && !autoFilled) errors.push(`${f.formLabel || f.label} is required`);
    data[f.key] = v;
  }
  return { data, errors };
}

const sum = (list, key) => round2((list || []).reduce((s, x) => s + (Number(x[key]) || 0), 0));

// Totals per module (modules.js `totals`).
const TOTALS = {
  // PO: total = Σ amount, gstAmount = total × gst%, payable = total + gst − discount(₹)
  po(d) {
    const totalAmount = sum(d.products, 'amount');
    const gstAmount = round2((totalAmount * (Number(d.gst) || 0)) / 100);
    return { totalAmount, gstAmount, payableAmount: round2(totalAmount + gstAmount - (Number(d.discount) || 0)) };
  },
  // PI: subtotal = items − discount% + freight, GST on subtotal, total payable rounded to the rupee
  pi(d) {
    const itemsTotal = sum(d.items, 'total');
    const subtotal = round2(itemsTotal * (1 - (Number(d.discount) || 0) / 100) + (Number(d.freight) || 0));
    const gstAmount = round2((subtotal * (Number(d.gst) || 0)) / 100);
    const exact = round2(subtotal + gstAmount);
    const totalPayable = Math.round(exact);
    return { itemsTotal, subtotal, gstAmount, roundOff: round2(totalPayable - exact), totalPayable };
  },
  // Quotation: GST on (items + freight + LP amount)
  quotation(d) {
    const itemsTotal = sum(d.products, 'total');
    const base = itemsTotal + (Number(d.freight) || 0) + (Number(d.lpAmount) || 0);
    const gstAmount = round2((base * (Number(d.gst) || 0)) / 100);
    return { itemsTotal, gstAmount, totalPayable: round2(base + gstAmount) };
  },
  salesOrder(d) {
    const itemsTotal = sum(d.items, 'total');
    return { grandTotal: round2(itemsTotal * (1 + (Number(d.gst) || 0) / 100)) };
  },
  // Inventory: current stock = inward − outward
  inventory(d) {
    return { current: (Number(d.inward) || 0) - (Number(d.outward) || 0) };
  },
};

// Lead assignment: the assignee must be an active employee. Assigning a "New Lead" moves it to "Assigned".
async function checkAssignee(data, status, errors) {
  if (data.assignedTo === undefined || data.assignedTo === null) return status;
  const u = await one('select id, active from crm_users where id = $1', [data.assignedTo]);
  if (!u || !u.active) errors.push('Assigned To: employee not found');
  return status === 'New Lead' ? 'Assigned' : status;
}

// The "Sales Head ID" chosen on the enquiry form must be an active Sales Head.
async function checkSalesHead(data, errors) {
  if (data.salesHead === undefined || data.salesHead === null) return;
  const u = await one("select id from crm_users where id = $1 and active and role = 'employee' and designation = 'Sales Head'", [data.salesHead]);
  if (!u) errors.push('Sales Head: choose a Sales Head from the list');
}

// A quotation raised against an enquiry moves that enquiry to "Quoted" (if it hasn't gone further).
async function markLeadQuoted(client, enquiryNo) {
  if (!enquiryNo) return;
  await client.query(
    `update crm_records set status = 'Quoted', status_changed_at = now(), updated_at = now()
     where module = 'leads' and data->>'enqNo' = $1 and status in ('New Lead', 'Assigned')`,
    [enquiryNo]
  );
}

// "own" access to leads covers leads the person created and leads assigned to them.
const ownLeadSql = (alias, n) => `(${alias}.created_by = $${n} or ${alias}.data->>'assignedTo' = $${n}::text)`;
const ownsRecord = (moduleKey, row, user) =>
  row.created_by === user.id || (moduleKey === 'leads' && String(row.data?.assignedTo ?? '') === String(user.id));

function computeDerived(mod, data) {
  return mod.totals ? { ...data, ...TOTALS[mod.totals](data) } : data;
}

async function fillAutoNumbers(client, moduleKey, mod, data) {
  for (const f of mod.fields) {
    if (f.autoNumber && !data[f.key]) {
      const fy = f.autoNumber.fyField ? String(data[f.autoNumber.fyField] || '').trim() : undefined;
      data[f.key] = await generateNumber(client, f.autoNumber, { module: moduleKey, field: f.key }, fy);
    }
  }
}

const SELECT = `select r.*, u.name as created_by_name, u.emp_code as created_by_code, u.email as created_by_email,
                       a.name as assigned_to_name, a.emp_code as assigned_to_code,
                       sh.name as sales_head_name, sh.emp_code as sales_head_code
                from crm_records r
                left join crm_users u on u.id = r.created_by
                left join crm_users a on a.id = case when r.data->>'assignedTo' ~ '^[0-9]+$' then (r.data->>'assignedTo')::bigint end
                left join crm_users sh on sh.id = case when r.data->>'salesHead' ~ '^[0-9]+$' then (r.data->>'salesHead')::bigint end`;

// GET /api/records/:module?search=&status=&from=YYYY-MM-DD&to=YYYY-MM-DD&today=converted|notConverted|created&createdBy=&page=&limit=
router.get('/:module', ah(async (req, res) => {
  const { mod, level } = getModule(req, res);
  if (!mod) return;
  const { search, status, from, to, today, createdBy } = req.query;
  const limit = Math.min(Number(req.query.limit) || 500, 2000);
  const page = Math.max(Number(req.query.page) || 1, 1);

  const where = [];
  const params = [];
  const add = (sqlWithQ, ...vals) => {
    // replaces each ? with the next $n placeholder
    let s = sqlWithQ;
    for (const v of vals) {
      params.push(v);
      s = s.replace('?', `$${params.length}`);
    }
    where.push(s);
  };

  add('r.module = ?', req.params.module);
  if (level === 'service') {
    add("r.data->>'category' = ?", 'Service');
  } else if (!can.seeAll(level)) {
    if (req.params.module === 'leads') {
      params.push(req.user.id);
      where.push(ownLeadSql('r', params.length));
    } else add('r.created_by = ?', req.user.id);
  } else if (createdBy) add('r.created_by = ?', Number(createdBy));

  if (search) {
    const q = `%${search}%`;
    // match field values (not field names), the status and the employee's name/code
    add(
      `((select string_agg(v, ' ') from jsonb_each_text(r.data) as e(k, v)) ilike ?
        or coalesce(r.status,'') ilike ? or coalesce(u.name,'') ilike ? or coalesce(u.emp_code,'') ilike ?)`,
      q, q, q, q
    );
  }
  if (status) add('r.status = ?', status);
  if (from) add('r.created_at >= ?', localDateToISO(from));
  if (to) add('r.created_at < ?', localDateToISO(to, true));
  if (today) {
    const [start, end] = localDayRange();
    if (today === 'converted' || today === 'notConverted') {
      add('r.status = ? and r.status_changed_at >= ? and r.status_changed_at < ?', today === 'converted' ? CONVERTED : NOT_CONVERTED, start, end);
    } else {
      add('r.created_at >= ? and r.created_at < ?', start, end);
    }
  }

  const whereSql = where.join(' and ');
  const { n: total } = await one(
    `select count(*)::int as n from crm_records r left join crm_users u on u.id = r.created_by where ${whereSql}`,
    params
  );
  const { rows } = await query(
    `${SELECT} where ${whereSql} order by r.created_at desc, r.id desc limit ${limit} offset ${(page - 1) * limit}`,
    params
  );
  res.json({ total, page, limit, pages: Math.max(1, Math.ceil(total / limit)), items: rows.map(shape) });
}));

router.get('/:module/:id', ah(async (req, res) => {
  const { mod, level } = getModule(req, res);
  if (!mod) return;
  const row = await one(`${SELECT} where r.module = $1 and r.id = $2`, [req.params.module, Number(req.params.id)]);
  if (!row) return res.status(404).json({ message: `${mod.singular} not found` });
  const serviceOk = level === 'service' && row.data?.category === 'Service';
  if (!can.seeAll(level) && !serviceOk && !ownsRecord(req.params.module, row, req.user)) return res.status(403).json({ message: 'Not allowed' });
  res.json(shape(row));
}));

// When a lead is converted, make sure a matching customer exists (matched by phone).
async function ensureCustomerFromLead(client, lead, userId) {
  if (!lead.phone) return;
  const { rows } = await client.query("select 1 from crm_records where module = 'customers' and data->>'phone' = $1 limit 1", [lead.phone]);
  if (rows.length) return;
  const data = {
    companyName: lead.companyName || lead.customerName,
    contactPerson: lead.customerName ?? null,
    phone: lead.phone,
    email: lead.email ?? null,
    address: [lead.city, lead.state].filter(Boolean).join(', ') || null,
    gst: null,
    pan: null,
  };
  await fillAutoNumbers(client, 'customers', modules.customers, data);
  await client.query('insert into crm_records (module, data, created_by) values ($1, $2, $3)', ['customers', data, userId]);
}

// POST /api/records/customers/bulk  { customers: [{ companyName, gst, pan, contactPerson, phone, email, address }] }
// Used by "Add Customers from Documents" after the user has checked the rows. Invalid rows are reported and skipped,
// customers that already exist (same GST or PAN; same company name when the row has neither) are counted and skipped.
const BULK_MAX = 5000;
const strOf = (v) => (v === null || v === undefined ? '' : String(v).trim());
const customerKeys = (c) => {
  const gst = strOf(c.gst).toUpperCase();
  const pan = strOf(c.pan).toUpperCase();
  const name = strOf(c.companyName).toLowerCase().replace(/\s+/g, ' ');
  return gst || pan ? [gst && `g:${gst}`, pan && `p:${pan}`].filter(Boolean) : name ? [`n:${name}`] : [];
};
router.post('/customers/bulk', ah(async (req, res) => {
  const mod = modules.customers;
  const level = levelFor(req.user, 'customers');
  if (!can.create(level)) return res.status(403).json({ message: `Your role can't add ${mod.label}` });
  const list = req.body?.customers;
  if (!Array.isArray(list) || !list.length) return res.status(400).json({ message: 'No customers to add' });
  if (list.length > BULK_MAX) return res.status(400).json({ message: `Add at most ${BULK_MAX} customers per request` });

  // everything that already exists (all users), as lookup keys
  const seen = new Set();
  for (const r of (await query("select data from crm_records where module = 'customers'")).rows) {
    const gst = strOf(r.data?.gst).toUpperCase();
    const pan = strOf(r.data?.pan).toUpperCase();
    const name = strOf(r.data?.companyName).toLowerCase().replace(/\s+/g, ' ');
    if (gst) seen.add(`g:${gst}`);
    if (pan) seen.add(`p:${pan}`);
    if (name) seen.add(`n:${name}`);
  }

  const good = [];
  const invalid = [];
  let invalidCount = 0;
  let duplicates = 0;
  list.forEach((raw, i) => {
    const row = raw && typeof raw === 'object' ? { ...raw } : {};
    if (row.gst) row.gst = strOf(row.gst).toUpperCase();
    if (row.pan) row.pan = strOf(row.pan).toUpperCase();
    const { data, errors } = clean(mod, row);
    if (errors.length) {
      invalidCount += 1;
      if (invalid.length < 50) invalid.push(`Row ${i + 1}${data.companyName ? ` (${data.companyName})` : ''}: ${[...new Set(errors)].join(', ')}`);
      return;
    }
    const keys = customerKeys(data);
    if (keys.some((k) => seen.has(k))) { duplicates += 1; return; }
    keys.forEach((k) => seen.add(k));
    good.push(data);
  });

  if (good.length) {
    await tx(async (client) => {
      // Cus IDs: random like the single-add form, checked against existing ones in one query instead of one per row
      const taken = new Set((await client.query("select data->>'cusId' as id from crm_records where module = 'customers' and data ? 'cusId'")).rows.map((r) => r.id));
      const { code, digits } = mod.fields.find((f) => f.key === 'cusId').autoNumber;
      for (const d of good) {
        let id;
        do id = `${code}-${String(require('crypto').randomInt(0, 10 ** digits)).padStart(digits, '0')}`; while (taken.has(id));
        taken.add(id);
        d.cusId = id;
      }
      await client.query(
        "insert into crm_records (module, data, created_by) select 'customers', d, $2 from jsonb_array_elements($1::jsonb) as d",
        [JSON.stringify(good), req.user.id]
      );
    });
  }
  res.status(201).json({ added: good.length, duplicates, invalidCount, invalid });
}));

// POST /api/records/inventory/bulk  { products: [...], updateExisting: true }
// Used by Inventory > Upload Excel after the user has checked the rows. Matches products by Item Code (any case).
// Existing item + updateExisting -> only the filled-in columns change; otherwise it counts as a duplicate and is skipped.
const INV_NUMERIC = ['price', 'inward', 'outward', 'minStock'];
router.post('/inventory/bulk', ah(async (req, res) => {
  const mod = modules.inventory;
  if (!can.create(levelFor(req.user, 'inventory'))) return res.status(403).json({ message: "Your role can't add inventory" });
  const list = req.body?.products;
  if (!Array.isArray(list) || !list.length) return res.status(400).json({ message: 'No products to add' });
  if (list.length > 20000) return res.status(400).json({ message: 'Add at most 20,000 products per request' });
  const updateExisting = req.body.updateExisting !== false;

  const existing = new Map();
  for (const r of (await query("select id, data from crm_records where module = 'inventory'")).rows) {
    const k = strOf(r.data?.itemCode).toLowerCase();
    if (k) existing.set(k, { id: r.id, data: r.data });
  }
  const seenNew = new Set();
  const fresh = []; const changes = []; const invalid = [];
  let invalidCount = 0; let duplicates = 0;
  list.forEach((raw, i) => {
    const row = raw && typeof raw === 'object' ? raw : {};
    const { data, errors } = clean(mod, row);
    for (const k of INV_NUMERIC) if (typeof data[k] === 'number' && data[k] < 0) errors.push(`${mod.fields.find((f) => f.key === k).label} must be a positive number`);
    if (errors.length) {
      invalidCount += 1;
      if (invalid.length < 50) invalid.push(`Row ${i + 1}${data.itemCode ? ` (${data.itemCode})` : ''}: ${[...new Set(errors)].join(', ')}`);
      return;
    }
    const key = strOf(data.itemCode).toLowerCase();
    if (seenNew.has(key)) { duplicates += 1; return; }
    seenNew.add(key);
    const old = existing.get(key);
    if (!old) { fresh.push(data); return; }
    if (!updateExisting) { duplicates += 1; return; }
    const patch = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null && v !== undefined));
    changes.push({ id: old.id, before: old.data, data: computeDerived(mod, { ...old.data, ...patch }) });
  });

  await tx(async (client) => {
    for (const c of changes) await client.query('update crm_records set data = $1, updated_at = now() where id = $2', [c.data, c.id]);
    if (fresh.length) {
      const rows = fresh.map((d) => computeDerived(mod, d));
      await client.query(
        "insert into crm_records (module, data, created_by) select 'inventory', d, $2 from jsonb_array_elements($1::jsonb) as d",
        [JSON.stringify(rows), req.user.id]
      );
      fresh.splice(0, fresh.length, ...rows);
    }
  });
  await safely(() => notify.notifyLowStock(null, [...fresh.map((data) => ({ data })), ...changes.map((c) => ({ data: c.data, before: c.before }))], req.user.id));
  res.status(201).json({ added: fresh.length, updated: changes.length, duplicates, invalidCount, invalid });
}));

router.post('/:module', ah(async (req, res) => {
  const { mod, level } = getModule(req, res);
  if (!mod) return;
  if (!can.create(level)) return res.status(403).json({ message: `Your role can't add ${mod.label}` });

  const { data: cleaned, errors } = clean(mod, req.body || {});
  if (cleaned.financialYear && !/^\d{2}-\d{2}$/.test(cleaned.financialYear)) errors.push('Financial Year must look like 26-27');
  let status = mod.statuses ? req.body.status || mod.statuses[0] : null;
  if (req.params.module === 'leads' && req.user.dashboard === 'leads') status = mod.statuses[0]; // Lead Filler: always a New Lead
  if (mod.statuses && !mod.statuses.includes(status)) errors.push('Invalid status');
  if (req.params.module === 'leads') {
    if (!can.editAll(level) && 'assignedTo' in cleaned) cleaned.assignedTo = null; // only team leads assign
    status = await checkAssignee(cleaned, status, errors);
    await checkSalesHead(cleaned, errors);
  }
  if (errors.length) return res.status(400).json({ message: [...new Set(errors)].join(', '), errors });

  const id = await tx(async (client) => {
    const data = computeDerived(mod, cleaned);
    if (req.params.module === 'pi') data.fy = financialYear();
    await fillAutoNumbers(client, req.params.module, mod, data);
    const { rows } = await client.query(
      `insert into crm_records (module, data, status, created_by, status_changed_at)
       values ($1, $2, $3, $4, case when $3::text is null then null else now() end) returning id`,
      [req.params.module, data, status, req.user.id]
    );
    if (req.params.module === 'leads' && status === CONVERTED) await ensureCustomerFromLead(client, data, req.user.id);
    if (req.params.module === 'quotations') await markLeadQuoted(client, data.enquiryNo);
    // enquiry created from the Email Leads page: mark that email as converted
    if (req.params.module === 'leads' && /^\d+$/.test(String(data.emailLeadId ?? ''))) {
      await client.query(
        "update crm_email_leads set status = 'converted', lead_id = $1 where id = $2 and user_id = $3",
        [rows[0].id, Number(data.emailLeadId), req.user.id]
      );
    }
    return rows[0].id;
  });
  const created = await one(`${SELECT} where r.id = $1`, [id]);
  await safely(async () => {
    await notify.recordCreated(null, req.params.module, created.data, req.user.id, req.user.name);
    if (req.params.module === 'leads' && created.data.assignedTo) await notify.leadAssigned(null, created.data, req.user.id);
    if (req.params.module === 'inventory') await notify.notifyLowStock(null, [{ data: created.data }], req.user.id);
  });
  res.status(201).json(shape(created));
}));

router.put('/:module/:id', ah(async (req, res) => {
  const { mod, level } = getModule(req, res);
  if (!mod) return;
  const row = await one('select * from crm_records where module = $1 and id = $2', [req.params.module, Number(req.params.id)]);
  if (!row) return res.status(404).json({ message: `${mod.singular} not found` });
  const mayEdit = can.editAll(level) || (can.create(level) && ownsRecord(req.params.module, row, req.user));
  if (!mayEdit) return res.status(403).json({ message: 'Not allowed' });

  const { data: patch, errors } = clean(mod, req.body || {}, { partial: true });
  let status = row.status;
  if (mod.statuses && 'status' in req.body) {
    if (!mod.statuses.includes(req.body.status)) errors.push('Invalid status');
    else status = req.body.status;
  }
  // Lead Fillers enter enquiries; moving them through the pipeline is the sales team's job.
  if (req.params.module === 'leads' && req.user.dashboard === 'leads' && status !== row.status) errors.push('Only the sales team can change the enquiry stage');
  if (req.params.module === 'leads' && 'assignedTo' in patch) {
    // only team leads (and admin) hand out leads
    if (!can.editAll(level) && String(patch.assignedTo ?? '') !== String(row.data.assignedTo ?? '')) errors.push('Only the Sales Head can assign leads');
    else status = await checkAssignee(patch, status, errors);
  }
  if (req.params.module === 'leads' && 'salesHead' in patch) await checkSalesHead(patch, errors);
  if (errors.length) return res.status(400).json({ message: [...new Set(errors)].join(', '), errors });

  const data = computeDerived(mod, { ...row.data, ...patch });
  const statusChanged = status !== row.status;

  await tx(async (client) => {
    await fillAutoNumbers(client, req.params.module, mod, data);
    await client.query(
      `update crm_records set data = $1, status = $2, updated_at = now(),
         status_changed_at = case when $3 then now() else status_changed_at end
       where id = $4`,
      [data, status, statusChanged, row.id]
    );
    if (req.params.module === 'leads' && status === CONVERTED && statusChanged) await ensureCustomerFromLead(client, data, req.user.id);
    if (req.params.module === 'quotations' && patch.enquiryNo) await markLeadQuoted(client, data.enquiryNo);
  });

  await safely(async () => {
    if (req.params.module === 'leads') {
      if ('assignedTo' in patch && String(patch.assignedTo ?? '') !== String(row.data.assignedTo ?? '') && data.assignedTo) await notify.leadAssigned(null, data, req.user.id);
      if (statusChanged) await notify.leadStageChanged(null, data, row.created_by, status, req.user.id);
    }
    if (req.params.module === 'inventory') await notify.notifyLowStock(null, [{ data, before: row.data }], req.user.id);
  });
  res.json(shape(await one(`${SELECT} where r.id = $1`, [row.id])));
}));

router.delete('/:module/:id', ah(async (req, res) => {
  const { mod, level } = getModule(req, res);
  if (!mod) return;
  if (!can.delete(level)) return res.status(403).json({ message: "Your role can't delete records" });
  const r = await query('delete from crm_records where module = $1 and id = $2', [req.params.module, Number(req.params.id)]);
  if (!r.rowCount) return res.status(404).json({ message: `${mod.singular} not found` });
  res.json({ message: `${mod.singular} deleted` });
}));

module.exports = router;
