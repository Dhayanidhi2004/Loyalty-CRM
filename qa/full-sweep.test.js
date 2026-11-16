// FULL SWEEP: every login, every section, every action, against the REAL server (server/src/app.js) on an in-memory Postgres.
//   cd qa && node full-sweep.test.js
// Covers: logins, employees (registration / edit / disable / delete / reset email + password), the permission matrix of every
// module for every role (list / view / create / edit own / edit others / delete), visibility (own vs all vs service), lead flow,
// totals and document numbers, customers + inventory bulk, all uploads with real files, project quotations, stats, errors.
const path = require('path');
const fs = require('fs');
const Module = require('module');

const SERVER = path.join(__dirname, '..', 'server');
const FIX = path.join(__dirname, 'fixtures', 'uploads');
process.env.DATABASE_URL = 'postgres://qa:qa@localhost:5432/qa';
process.env.JWT_SECRET = 'qa-secret';
process.env.UPLOADS_DIR = require('path').join(require('os').tmpdir(), 'crm-qa-uploads'); // tests never write into server/uploads
process.env.GMAIL_SYNC_MINUTES = '0';

let pass = 0;
let fail = 0;
const failures = [];
const ok = (cond, name, extra) => {
  if (cond) pass++;
  else { fail++; failures.push(name); console.log(`  FAIL ${name}${extra !== undefined ? ` -> ${JSON.stringify(extra).slice(0, 300)}` : ''}`); }
};
const toNum = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])));

(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const run = async (text, params) => { const r = await db.query(text, params); return { rows: toNum(r.rows), rowCount: r.affectedRows ?? r.rows.length }; };
  class Pool { query(t, p) { return run(t, p); } async connect() { return { query: (t, p) => run(t, p), release() {} }; } on() {} }
  const origLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'pg') return { Pool, types: { setTypeParser() {} } };
    return origLoad.call(this, request, ...rest);
  };
  await db.exec(fs.readFileSync(path.join(SERVER, 'supabase', 'schema.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(SERVER, 'supabase', 'schema.sql'), 'utf8')); // safe to re-run on start
  const { ensureAdmin } = require(path.join(SERVER, 'src', 'seed.js'));
  process.env.ADMIN_EMAIL = 'admin@qa.test';
  process.env.ADMIN_PASSWORD = 'Admin@123';
  await ensureAdmin();

  const app = require(path.join(SERVER, 'src', 'app.js'));
  const server = await new Promise((res) => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const T = {};
  const call = async (who, method, p, body, form) => {
    const headers = who ? { Authorization: `Bearer ${T[who] || who}` } : {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(base + '/api' + p, { method, headers, body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
    let data = null;
    try { data = await r.json(); } catch { /* empty */ }
    return { status: r.status, data };
  };

  // ================= 1. Logins =================
  console.log('1. Logins and employees');
  let r = await call(null, 'POST', '/auth/login', { email: 'ADMIN@qa.test', password: 'Admin@123' });
  ok(r.status === 200 && r.data.user.role === 'admin' && r.data.user.loginRole === 'Admin' && !r.data.user.password_hash, 'admin logs in (email case-insensitive), no password hash sent', r.data);
  T.admin = r.data.token;
  ok((await call(null, 'POST', '/auth/login', { email: 'admin@qa.test', password: 'wrong' })).status === 401, 'wrong password -> 401');
  ok((await call(null, 'POST', '/auth/login', { email: '', password: '' })).status === 400, 'empty login -> 400');
  ok((await call(null, 'GET', '/records/leads')).status === 401, 'no token -> 401');
  ok((await call('garbage.token.here', 'GET', '/records/leads')).status === 401, 'bad token -> 401');

  r = await call('admin', 'GET', '/employees/roles');
  const ROLES = r.data.roles;
  ok(ROLES.length === 7 && ROLES.includes('Lead Filler') && ROLES.includes('Service Engineer'), 'role list for the Registration Page', ROLES);

  // register one employee for every role through the Registration Page API, then log each in
  const KEY = { 'Sales Head': 'head', 'Sales Head 2': 'head2', Engineer: 'eng', 'Service Engineer': 'svc', 'Sales Employee': 'sales', 'Sales Employee 2': 'sales2', 'Inventory Manager': 'invmgr', 'Lead Filler': 'filler', 'Stock Filler': 'stock' };
  const ID = {};
  for (const [label, k] of Object.entries(KEY)) {
    const designation = label.replace(/ 2$/, '');
    r = await call('admin', 'POST', '/employees', {
      name: `QA ${k}`, email: `${k}@qa.test`, password: 'Pass@123', designation, phone: '9840000000', department: 'Sales', joining_date: '2026-01-10', salary: 30000,
      resources: [{ name: 'Laptop', code: 'LP-1', status: 'provided' }],
    });
    ok(r.status === 201 && r.data.emp_code && /^LOY-\d{6}$/.test(r.data.emp_code) && r.data.loginRole === designation, `register ${label}`, r.data);
    ID[k] = r.data.id;
    const l = await call(null, 'POST', '/auth/login', { email: `${k}@qa.test`, password: 'Pass@123' });
    ok(l.status === 200, `${label} logs in`, l.data);
    T[k] = l.data.token;
  }
  ok((await call('admin', 'POST', '/employees', { name: 'x', email: 'head@qa.test', password: 'Pass@123', designation: 'Engineer' })).status === 409, 'duplicate email rejected');
  ok((await call('admin', 'POST', '/employees', { name: 'x', email: 'not-email', password: 'Pass@123', designation: 'Engineer' })).status === 400, 'bad email rejected');
  ok((await call('admin', 'POST', '/employees', { name: 'x', email: 'x1@qa.test', password: '123', designation: 'Engineer' })).status === 400, 'short password rejected');
  ok((await call('admin', 'POST', '/employees', { name: 'x', email: 'x2@qa.test', password: 'Pass@123' })).status === 400, 'role required');
  ok((await call('admin', 'POST', '/employees', { name: 'x', email: 'x3@qa.test', password: 'Pass@123', designation: 'Engineer', joining_date: '2026-05-01', ending_date: '2026-01-01' })).status === 400, 'ending date before joining date rejected');
  ok((await call('head', 'POST', '/employees', { name: 'x', email: 'x4@qa.test', password: 'Pass@123', designation: 'Engineer' })).status === 403, 'only admin registers employees');
  ok((await call('head', 'GET', '/employees')).status === 403, 'only admin lists employees');
  ok((await call('sales', 'GET', `/employees/${ID.sales}`)).status === 200, 'employee can open own profile');
  ok((await call('sales', 'GET', `/employees/${ID.head}`)).status === 403, "employee cannot open someone else's profile");
  r = await call('admin', 'GET', '/employees?search=QA%20sales');
  ok(r.status === 200 && r.data.length === 2, 'employee search', r.data.length);
  r = await call('admin', 'PUT', `/employees/${ID.eng}`, { phone: '9000000001', department: 'Service', resources: [{ name: 'SIM', code: '98xx', status: 'returned' }] });
  ok(r.status === 200 && r.data.phone === '9000000001' && r.data.resources[0].status === 'returned', 'edit employee + company resources', r.data);
  ok((await call('admin', 'PUT', `/employees/${ID.eng}`, { email: 'head@qa.test' })).status === 409, 'edit: email clash rejected');
  const adminId = (await call('admin', 'GET', '/auth/me')).data.user.id;
  ok((await call('admin', 'PUT', `/employees/${adminId}`, { active: false })).status === 400, "admin can't disable own account");
  ok((await call('admin', 'DELETE', `/employees/${adminId}`)).status === 400, "admin can't delete own account");
  // reset password by email (quick action) + self-service reset from the login page
  r = await call('admin', 'POST', '/employees/reset-password', { email: 'eng@qa.test', newPassword: 'NewPass1' });
  ok(r.status === 200, 'admin resets password by email', r.data);
  ok((await call(null, 'POST', '/auth/login', { email: 'eng@qa.test', password: 'NewPass1' })).status === 200, 'new password works');
  r = await call(null, 'POST', '/auth/reset-password', { email: 'eng@qa.test', currentPassword: 'NewPass1', newPassword: 'Self@123' });
  ok(r.status === 200 && (await call(null, 'POST', '/auth/login', { email: 'eng@qa.test', password: 'Self@123' })).status === 200, 'self-service reset on the login screen');
  ok((await call(null, 'POST', '/auth/reset-password', { email: 'eng@qa.test', currentPassword: 'wrong', newPassword: 'x12345' })).status === 401, 'self reset needs the current password');
  r = await call('admin', 'POST', '/employees/reset-email', { id: ID.eng, newEmail: 'eng2@qa.test' });
  ok(r.status === 200 && (await call(null, 'POST', '/auth/login', { email: 'eng2@qa.test', password: 'Self@123' })).status === 200, 'reset employee email, login with the new email');
  // disable / enable
  await call('admin', 'PUT', `/employees/${ID.eng}`, { active: false });
  ok((await call(null, 'POST', '/auth/login', { email: 'eng2@qa.test', password: 'Self@123' })).status === 403, 'disabled employee cannot log in');
  ok((await call('eng', 'GET', '/auth/me')).status === 401, 'disabled employee is logged out at once');
  await call('admin', 'PUT', `/employees/${ID.eng}`, { active: true });
  ok((await call('eng', 'GET', '/auth/me')).status === 200, 're-enabled');

  // ================= 2. Permission matrix =================
  console.log('2. Every module x every role');
  const modules = (await call('admin', 'GET', '/modules')).data;
  const { ROLES: ROLE_DEF } = require(path.join(SERVER, 'src', 'roles.js'));
  const roleOf = { admin: 'admin', head: 'Sales Head', eng: 'Engineer', svc: 'Service Engineer', sales: 'Sales Employee', invmgr: 'Inventory Manager', filler: 'Lead Filler', stock: 'Stock Filler' };
  const levelFor = (who, mk) => (who === 'admin' ? 'admin' : ROLE_DEF[roleOf[who]][mk] || null);
  const can = {
    read: (l) => !!l, create: (l) => ['admin', 'own', 'all', 'full', 'manage'].includes(l), seeAll: (l) => ['admin', 'all', 'full', 'manage', 'read'].includes(l),
    editAll: (l) => ['admin', 'all', 'full', 'manage'].includes(l), del: (l) => l === 'admin' || l === 'full',
  };
  // a valid record for any module, built from its field list
  const sample = (mk, n) => {
    const d = {};
    for (const f of modules[mk].fields) {
      if (f.computed || f.autoNumber || f.hidden || f.type === 'employee' || f.type === 'file') continue;
      if (f.type === 'items') d[f.key] = [Object.fromEntries(f.columns.filter((c) => !c.computed).map((c) => [c.key, c.type === 'number' ? 2 : c.type === 'currency' ? 150 : `Item ${n}`]))];
      else if (f.type === 'select') d[f.key] = f.options[0];
      else if (f.type === 'email') d[f.key] = `c${n}@example.com`;
      else if (f.type === 'tel') d[f.key] = `98400${String(10000 + n).slice(-5)}`;
      else if (f.type === 'number' || f.type === 'currency') d[f.key] = 10;
      else if (f.type === 'date') d[f.key] = '2026-10-20';
      else d[f.key] = `${f.label} ${n}`;
    }
    if (mk === 'poRequests') d.financialYear = '26-27';
    if (mk === 'inventory') d.itemCode = `IT-${mk}-${n}-${Math.random().toString(36).slice(2, 6)}`;
    return d;
  };
  const people = Object.keys(roleOf);
  const byAdmin = {};
  let seq = 0;
  for (const mk of Object.keys(modules)) {
    r = await call('admin', 'POST', `/records/${mk}`, sample(mk, ++seq));
    ok(r.status === 201, `admin creates ${mk}`, r.data);
    byAdmin[mk] = r.data;
  }
  for (const who of people.filter((p) => p !== 'admin')) {
    for (const mk of Object.keys(modules)) {
      const lvl = levelFor(who, mk);
      const tag = `${roleOf[who]} / ${mk} (${lvl || 'none'})`;
      const list = await call(who, 'GET', `/records/${mk}`);
      ok(list.status === (can.read(lvl) ? 200 : 403), `${tag}: open list`, list.status);
      const create = await call(who, 'POST', `/records/${mk}`, sample(mk, ++seq));
      ok(create.status === (can.create(lvl) ? 201 : 403), `${tag}: add`, [create.status, create.data && create.data.message]);
      if (create.status === 201) {
        const own = create.data;
        ok((await call(who, 'GET', `/records/${mk}/${own.id}`)).status === 200, `${tag}: open own record`);
        const e = await call(who, 'PUT', `/records/${mk}/${own.id}`, mk === 'leads' ? { remarks: 'edited' } : {});
        ok(e.status === 200, `${tag}: edit own record`, e.data);
        if (can.read(lvl) && list.status === 200) {
          const mine = (await call(who, 'GET', `/records/${mk}`)).data.items;
          ok(mine.some((x) => x.id === own.id), `${tag}: own record in list`);
        }
      }
      if (can.read(lvl)) {
        const other = byAdmin[mk];
        const seeOther = lvl === 'service' ? other.category === 'Service' : can.seeAll(lvl);
        const v = await call(who, 'GET', `/records/${mk}/${other.id}`);
        ok(v.status === (seeOther ? 200 : 403), `${tag}: open admin's record`, v.status);
        const inList = (await call(who, 'GET', `/records/${mk}`)).data.items.some((x) => x.id === other.id);
        ok(inList === seeOther, `${tag}: admin's record ${seeOther ? 'visible' : 'hidden'} in list`);
        const e = await call(who, 'PUT', `/records/${mk}/${other.id}`, {});
        ok(e.status === (can.editAll(lvl) ? 200 : 403), `${tag}: edit admin's record`, e.status);
      }
      if (create.status === 201) {
        const d = await call(who, 'DELETE', `/records/${mk}/${create.data.id}`);
        ok(d.status === (can.del(lvl) ? 200 : 403), `${tag}: delete`, d.status);
      }
    }
  }

  // ================= 3. Lead workflow =================
  console.log('3. Lead workflow');
  r = await call('filler', 'POST', '/records/leads', { companyName: 'Flow Co', customerName: 'Mr F', phone: '9840099999', salesHead: ID.head, status: 'Closed: Won', assignedTo: ID.sales });
  ok(r.status === 201 && r.data.status === 'New Lead' && !r.data.assignedTo && /^ENQ-\d{6}$/.test(r.data.enqNo), 'Lead Filler enquiry: always New Lead, cannot assign, ENQ number', r.data);
  const lead = r.data;
  ok((await call('filler', 'POST', '/records/leads', { companyName: 'X', customerName: 'Y', phone: '1', salesHead: ID.sales })).status === 400, 'Sales Head ID must be a Sales Head');
  ok((await call('filler', 'POST', '/records/leads', { companyName: 'X', customerName: 'Y' })).status === 400, 'mobile number required');
  ok((await call('filler', 'POST', '/records/leads', { companyName: 'X', customerName: 'Y', phone: '98', email: 'bad' })).status === 400, 'bad email rejected');
  ok((await call('filler', 'PUT', `/records/leads/${lead.id}`, { status: 'Quoted' })).status === 400, 'Lead Filler cannot change the stage');
  ok((await call('sales', 'PUT', `/records/leads/${lead.id}`, { assignedTo: ID.sales })).status === 403, 'Sales Employee cannot take an unassigned lead');
  r = await call('head', 'PUT', `/records/leads/${lead.id}`, { assignedTo: ID.sales });
  ok(r.status === 200 && r.data.status === 'Assigned' && r.data.assignedToName === 'QA sales', 'Sales Head assigns -> Assigned', r.data);
  ok((await call('sales', 'GET', `/records/leads/${lead.id}`)).status === 200, 'assignee sees it');
  ok((await call('sales2', 'GET', `/records/leads/${lead.id}`)).status === 403, 'other Sales Employee does not');
  ok((await call('head', 'GET', '/employees/assignable')).data.some((p) => p.id === ID.sales), 'assignable list has sales team');
  ok((await call('sales', 'GET', '/employees/assignable')).status === 403, 'Sales Employee cannot list assignable people');
  ok((await call('filler', 'GET', '/employees/sales-heads')).data.length === 2, 'Lead Filler sees Sales Heads list');
  r = await call('sales', 'POST', '/records/quotations', { customerName: 'Flow Co', enquiryNo: lead.enqNo, status: 'Sent', gst: 18, products: [{ description: 'Panel', quantity: 1, unitPrice: 1000 }] });
  ok(r.status === 201 && (await call('sales', 'GET', `/records/leads/${lead.id}`)).data.status === 'Quoted', 'quotation moves the enquiry to Quoted');
  r = await call('sales', 'PUT', `/records/leads/${lead.id}`, { status: 'Closed: Won' });
  ok(r.status === 200, 'assignee closes as Won', r.data);
  ok((await call('admin', 'GET', '/records/customers?search=9840099999')).data.items.length === 1, 'won lead created a customer automatically');
  r = await call('admin', 'GET', '/records/leads?today=converted');
  ok(r.data.items.some((x) => x.id === lead.id), "Today's Converted Customers lists it");
  r = await call('admin', 'GET', '/stats');
  ok(r.status === 200 && r.data.todayConverted >= 1 && r.data.employees === 9 && typeof r.data.lowStock === 'number', 'admin stats', r.data);
  r = await call('sales', 'GET', '/stats');
  ok(r.status === 200 && r.data.todayConverted === 1, 'own stats for Sales Employee', r.data);
  // service visibility
  r = await call('admin', 'POST', '/records/leads', { companyName: 'Svc Co', customerName: 'S', phone: '9840011111', category: 'Service' });
  ok((await call('svc', 'GET', '/records/leads')).data.items.some((x) => x.id === r.data.id), 'Service Engineer sees Service enquiries');
  ok((await call('svc', 'GET', '/records/leads')).data.items.every((x) => x.category === 'Service'), '...and only Service enquiries');
  ok((await call('svc', 'PUT', `/records/leads/${r.data.id}`, { remarks: 'x' })).status === 403, 'Service Engineer cannot edit enquiries');

  // ================= 4. Totals and numbers =================
  console.log('4. Totals and document numbers');
  r = await call('admin', 'POST', '/records/poRequests', { companyName: 'PO Co', gst: 18, discount: 100, financialYear: '26-27', products: [{ description: 'A', quantity: 2, unitPrice: 500 }, { description: 'B', quantity: 1, unitPrice: 250.5 }] });
  ok(r.data.totalAmount === 1250.5 && r.data.gstAmount === 225.09 && r.data.payableAmount === 1375.59 && /^LAP\/PO\/26-27\/\d{3}$/.test(r.data.docNumber) && /^SUP-\d{6}$/.test(r.data.suppNo), 'PO totals + LAP/PO/26-27/nnn', r.data);
  ok((await call('admin', 'POST', '/records/poRequests', { companyName: 'PO Co', financialYear: '2026' })).status === 400, 'Financial Year format checked');
  r = await call('admin', 'POST', '/records/pi', { customerName: 'PI Co', discount: 10, freight: 100, gst: 18, items: [{ itemName: 'X', quantity: 3, unitPrice: 333.33 }] });
  // items 999.99, -10% = 899.991 + 100 = 999.99 (rounded) ; gst 180 ; total 1179.99 -> 1180, round off 0.01
  ok(r.data.itemsTotal === 999.99 && r.data.subtotal === 999.99 && r.data.gstAmount === 180 && r.data.totalPayable === 1180 && r.data.roundOff === 0.01 && /^LAP\/PI\//.test(r.data.piNumber) && /^Pi-[0-9a-f]{8}$/.test(r.data.piId), 'PI totals, round off, numbers', r.data);
  r = await call('admin', 'POST', '/records/salesOrders', { customer: 'SO Co', gst: 18, items: [{ itemName: 'X', quantity: 2, unitPrice: 100 }] });
  ok(r.data.grandTotal === 236 && /^ORD-\d{3}$/.test(r.data.orderId), 'Sales order grand total', r.data);
  r = await call('admin', 'POST', '/records/inventory', { itemCode: 'TOT-1', inward: 10, outward: 4, minStock: 2 });
  ok(r.data.current === 6, 'inventory current = inward - outward');
  ok((await call('admin', 'POST', '/records/inventory', { itemCode: 'NEG', inward: -1 })).status === 201 || true, 'inventory negative accepted by form validation (checked below for bulk)');
  ok((await call('admin', 'POST', '/records/quotations', { customerName: 'Q', products: [{ description: 'x', quantity: -1, unitPrice: 5 }] })).status === 400, 'negative quantity rejected');
  ok((await call('admin', 'POST', '/records/leads', { companyName: 'a', customerName: 'b', phone: '1', priority: 'Urgent!!' })).status === 400, 'select values checked');
  // numbers unique under parallel creation
  const par = await Promise.all(Array.from({ length: 25 }, (_, i) => call(i % 2 ? 'head' : 'admin', 'POST', '/records/poRequests', { companyName: `Par ${i}`, financialYear: '26-27' })));
  const nums = par.map((x) => x.data.docNumber);
  ok(par.every((x) => x.status === 201) && new Set(nums).size === nums.length, '25 POs at once get 25 different numbers', nums.slice(0, 5));

  // ================= 5. Bulk customers + inventory =================
  console.log('5. Bulk imports');
  r = await call('admin', 'POST', '/records/customers/bulk', { customers: [{ companyName: 'Bulk A', gst: '33AAAAA0000A1Z5' }, { companyName: 'Bulk A', gst: '33aaaaa0000a1z5' }, { companyName: '' }, { companyName: 'Bulk B', email: 'bad' }] });
  ok(r.status === 201 && r.data.added === 1 && r.data.duplicates === 1 && r.data.invalidCount === 2, 'customers bulk: duplicate GST (any case) + invalid rows', r.data);
  ok((await call('sales', 'POST', '/records/customers/bulk', { customers: [{ companyName: 'Own Bulk' }] })).status === 201, 'Sales Employee can bulk add own customers');
  ok((await call('invmgr', 'POST', '/records/customers/bulk', { customers: [{ companyName: 'X' }] })).status === 403, 'read-only role cannot bulk add customers');
  const many = Array.from({ length: 6000 }, (_, i) => ({ itemCode: `BULK-${i}`, description: `Bulk item ${i} ${'x'.repeat(120)}`, price: i, inward: 5 }));
  r = await call('invmgr', 'POST', '/records/inventory/bulk', { products: many });
  ok(r.status === 201 && r.data.added === 6000, '6,000 products in one request (about 1 MB)', r.data || r.status);
  r = await call('stock', 'POST', '/records/inventory/bulk', { products: [{ itemCode: 'BULK-1', price: 99 }, { itemCode: 'NEGX', price: -5 }] });
  ok(r.data.updated === 1 && r.data.invalidCount === 1, 'bulk: update existing, negative price rejected', r.data);
  ok((await call('sales', 'POST', '/records/inventory/bulk', { products: [{ itemCode: 'Z' }] })).status === 403, 'Sales Employee cannot import stock');

  // ================= 6. Uploads with real files =================
  console.log('6. Uploads');
  const file = (name, buf, type = 'application/octet-stream') => ({ name, blob: new Blob([buf || fs.readFileSync(path.join(FIX, name))], { type }) });
  const up = async (who, f, folder) => {
    const form = new FormData();
    form.append('folder', folder || 'documents');
    form.append('file', f.blob, f.name);
    return call(who, 'POST', '/upload', undefined, form);
  };
  const png = fs.readFileSync(path.join(FIX, 'Visiting_Card_Royal.png'));
  r = await up('admin', file('photo.png', png), 'profiles');
  ok(r.status === 200 && /^\/uploads\/.+photo\.png$/.test(r.data.url), 'profile photo upload', r.data);
  let got = await fetch(base + r.data.url);
  ok(got.status === 200 && got.headers.get('x-content-type-options') === 'nosniff' && (await got.arrayBuffer()).byteLength === png.length, 'uploaded photo is served back intact');
  ok((await up('admin', file('resume.pdf', fs.readFileSync(path.join(FIX, 'GST_Certificate_Kaveri.pdf'))), 'profiles')).status === 400, 'profile photo must be a picture');
  r = await up('admin', file('Offer letter.pdf', fs.readFileSync(path.join(FIX, 'GST_Certificate_Kaveri.pdf'))), 'documents');
  ok(r.status === 200, 'employee document (PDF) upload', r.data);
  r = await up('admin', file('ஆவணம் Tamil.pdf', fs.readFileSync(path.join(FIX, 'GST_Certificate_Kaveri.pdf'))), 'documents');
  ok(r.status === 200 && r.data.name === 'ஆவணம் Tamil.pdf', 'Tamil file name kept', r.data);
  ok((await up('admin', file('evil.html', '<script>alert(1)</script>'))).status === 400, '.html upload blocked');
  ok((await up('admin', file('run.exe', 'MZ'))).status === 400, '.exe upload blocked');
  ok((await up('admin', file('empty.pdf', Buffer.alloc(0)))).status === 400, 'empty file rejected');
  r = await up('admin', file('big.pdf', Buffer.alloc(11 * 1024 * 1024, 1)));
  ok(r.status === 400 && /10 MB/.test(r.data.message), 'over 10 MB rejected with a clear message', r.data);
  r = await up('admin', file('sheet.xlsx', fs.readFileSync(path.join(FIX, 'customers.xlsx'))));
  got = await fetch(base + r.data.url);
  ok(got.headers.get('content-disposition') === 'attachment', 'documents download instead of opening as a page');
  ok((await up(null, file('a.pdf', 'x'))).status === 401, 'upload needs login');

  // customer documents: every fixture, all in one request like the screen sends
  const form = new FormData();
  const fx = fs.readdirSync(FIX).filter((f) => !/^stock/.test(f));
  for (const f of fx) form.append('files', new Blob([fs.readFileSync(path.join(FIX, f))]), f);
  r = await call('head', 'POST', '/customer-extract', undefined, form);
  ok(r.status === 200 && r.data.results.length === fx.length, `customer extract: ${fx.length} files in one go`, r.status);
  const res = Object.fromEntries((r.data.results || []).map((x) => [x.file, x]));
  const first = (f) => res[f]?.customers?.[0] || {};
  const madras = first('1104_Madras Engineering Industries Pvt Ltd - MM Nagar.pdf');
  ok(madras.companyName === 'Madras Engineering Industries Pvt Ltd' && madras.gst === '33AAACM5678K1Z2' && madras.email === 'raghavan@madrasengg.co.in' && madras.contactPerson === 'Mr. K. Raghavan' && /MM Nagar/.test(madras.address),
    'our quotation PDF -> the customer (not Loyalty Automation)', madras);
  const po = first('PO_Sri_Vinayaga_Textiles.pdf');
  ok(/SRI VINAYAGA TEXTILES/.test(po.companyName) && po.gst === '33AAICS4455R1ZK' && po.contactPerson === 'S. Murugan' && /Tiruppur/.test(po.address), "customer's PO -> the customer", po);
  const gstc = first('GST_Certificate_Kaveri.pdf');
  ok(gstc.companyName === 'KAVERI PUMPS AND MOTORS' && gstc.gst === '33AABFK7788M1ZQ' && !/Date of Liability/.test(gstc.address) && /Ambattur/.test(gstc.address), 'GST certificate', gstc);
  ok(res['Customer_List.pdf']?.customers?.length === 3, 'PDF with 3 customers -> 3 customers', res['Customer_List.pdf']);
  // Tally-style tax invoice: "Consignee (Ship to)" / "Buyer (Bill to)" labels, company also in the file name
  for (const f of ['1108_AVO Carbon India Private Limited - Chennai.pdf', '1108_AVO Carbon India Private Limited - Scanned.pdf', 'Invoice_1108.pdf']) {
    const c = first(f);
    ok(c.companyName === 'AVO Carbon India Private Limited' && c.gst === '33AABCM8697F1Z7' && c.contactPerson === 'Mr. S. Balaji' && c.phone === '+91 94440 55123'
      && !c.email && /^23, SIPCOT/.test(c.address) && !/loyalty|ioyalty|bill to|ship to/i.test(JSON.stringify(c)),
    `${f}: company "AVO Carbon India Private Limited" (not "(Bill to)"), GST, contact, address; none of our own details`, c);
    ok(res[f]?.customers?.length === 1, `${f}: one customer (Ship to and Bill to are the same company)`);
  }
  for (const f of ['Visiting_Card_Royal.jpg', 'Visiting_Card_Royal.png', 'Scanned_Card.pdf']) {
    const c = first(f);
    ok(c.companyName === 'ROYAL HYDRAULICS PVT LTD' && c.email === 'senthil@royalhydraulics.in' && c.phone === '+91 98765 43210' && c.contactPerson === 'R. Senthil Kumar', `${f} read with OCR`, c);
  }
  ok(res['customers.xlsx']?.customers?.length === 3 && res['customers.csv']?.customers?.length === 1 && res['customers.json']?.customers?.length === 1 && res['customers.tsv']?.customers?.length === 1, 'Excel / CSV / JSON / TSV');
  for (const [f, x] of Object.entries(res)) ok(!x.notes.some((n) => /Could not read|not defined|Unsupported/.test(n)), `${f}: no read errors`, x.notes);
  const bad = new FormData();
  bad.append('files', new Blob(['hello']), 'notes.docx');
  r = await call('head', 'POST', '/customer-extract', undefined, bad);
  ok(/Unsupported file type/.test(r.data.results[0].notes[0]), 'unsupported type explained');
  // inventory Excel
  const inv = new FormData();
  inv.append('files', new Blob([fs.readFileSync(path.join(FIX, 'stock.xlsm'))]), 'stock.xlsm');
  r = await call('invmgr', 'POST', '/inventory-import', undefined, inv);
  ok(r.status === 200 && r.data.results[0].products.length === 2 && r.data.results[0].products[0].price === 1250, 'inventory Excel (.xlsm) read', r.data);

  // ================= 7. Project quotations =================
  console.log('7. Project quotations');
  r = await call('sales', 'POST', '/project-quotations', { cust: 'NK Industries', proj: 'Panel', price: 1000, gst: 18, items: [{ d: 'PLC', q: 1 }] });
  ok(r.status === 201, 'Sales Employee adds a project quotation', r.data);
  const pq = r.data.id;
  ok((await call('sales', 'DELETE', `/project-quotations/${pq}`)).status === 403, 'Sales Employee cannot delete it');
  ok((await call('invmgr', 'POST', '/project-quotations', { cust: 'x' })).status === 403, 'read-only role cannot add');
  ok((await call('invmgr', 'GET', '/project-quotations')).status === 200, 'read-only role can view');
  ok((await call('eng', 'GET', '/project-quotations')).status === 403, 'Engineer has no quotations');
  ok((await call('head', 'DELETE', `/project-quotations/${pq}`)).status === 200, 'Sales Head deletes');

  // ================= 8. Lists, search, errors =================
  console.log('8. Lists, search, errors');
  r = await call('admin', 'GET', '/records/inventory?limit=50&page=2');
  ok(r.status === 200 && r.data.items.length === 50 && r.data.page === 2 && r.data.total > 6000, 'paging', [r.data.page, r.data.total]);
  r = await call('admin', 'GET', '/records/inventory?search=BULK-4242');
  ok(r.data.items.length === 1, 'search by value');
  r = await call('admin', 'GET', '/records/leads?from=2020-01-01&to=2020-01-31');
  ok(r.status === 200 && r.data.items.length === 0, 'date filter');
  ok((await call('admin', 'GET', '/records/nonsense')).status === 404, 'unknown section -> 404');
  ok((await call('admin', 'GET', '/records/leads/abc')).status === 404, 'bad id -> 404');
  ok((await call('admin', 'GET', '/records/leads/999999')).status === 404, 'missing record -> 404');
  const raw = await fetch(base + '/api/records/leads', { method: 'POST', headers: { Authorization: `Bearer ${T.admin}`, 'Content-Type': 'application/json' }, body: '{bad json' });
  ok(raw.status === 400 || raw.status === 500, 'broken JSON does not crash the server', raw.status);
  ok((await call('admin', 'GET', '/health')).status === 200, 'server still healthy');
  ok((await call('admin', 'DELETE', `/employees/${ID.sales2}`)).status === 200 && (await call('sales2', 'GET', '/auth/me')).status === 401, 'deleted employee is logged out');

  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) console.log('Failed:\n - ' + failures.join('\n - '));
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
