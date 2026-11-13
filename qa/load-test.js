// Load test: many people using the CRM at once (all 8 login types), mixed real actions, then checks nothing broke:
// no server errors, no duplicate document numbers, totals still right, everyone still sees only what they should.
//   cd qa && node load-test.js [users=80] [seconds=60]
// Runs on an in-memory Postgres (one connection), so the timings are a lower bound; Supabase handles parallel queries better.
const path = require('path');
const fs = require('fs');
const Module = require('module');

const USERS = Number(process.argv[2]) || 80;
const SECONDS = Number(process.argv[3]) || 60;
const SERVER = path.join(__dirname, '..', 'server');
process.env.DATABASE_URL = 'postgres://qa:qa@localhost:5432/qa';
process.env.JWT_SECRET = 'qa-secret';
process.env.UPLOADS_DIR = require('path').join(require('os').tmpdir(), 'crm-qa-uploads'); // tests never write into server/uploads
process.env.GMAIL_SYNC_MINUTES = '0';
process.env.ADMIN_EMAIL = 'admin@qa.test';
process.env.ADMIN_PASSWORD = 'Pass@123';
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
  await require(path.join(SERVER, 'src', 'seed.js')).ensureAdmin();
  const app = require(path.join(SERVER, 'src', 'app.js'));
  const server = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const stats = { calls: 0, errors: [], byKind: {}, times: [], reassigned: [] };
  const call = async (token, method, p, body, expectFail) => {
    const t0 = Date.now();
    const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => null);
    stats.calls++; stats.times.push(Date.now() - t0);
    stats.byKind[`${method} ${p.split('?')[0].replace(/\/\d+/g, '/:id')}`] = (stats.byKind[`${method} ${p.split('?')[0].replace(/\/\d+/g, '/:id')}`] || 0) + 1;
    if (r.status >= 500 || (!r.ok && !expectFail)) stats.errors.push(`${r.status} ${method} ${p} ${JSON.stringify(data).slice(0, 150)}`);
    return { status: r.status, data };
  };
  const admin = (await call(null, 'POST', '/auth/login', { email: 'admin@qa.test', password: 'Pass@123' })).data.token;
  const roles = ['Sales Head', 'Sales Employee', 'Engineer', 'Service Engineer', 'Inventory Manager', 'Lead Filler', 'Stock Filler'];
  const users = [];
  for (let i = 0; i < USERS; i++) {
    const designation = i < 3 ? 'Sales Head' : roles[i % roles.length];
    const u = (await call(admin, 'POST', '/employees', { name: `User ${i}`, email: `u${i}@qa.test`, password: 'Pass@123', designation })).data;
    users.push({ id: u.id, role: designation });
  }
  // everyone logs in at the same moment
  const logins = await Promise.all(users.map((u, i) => call(null, 'POST', '/auth/login', { email: `u${i}@qa.test`, password: 'Pass@123' })));
  logins.forEach((l, i) => { users[i].token = l.data.token; });
  const heads = users.filter((u) => u.role === 'Sales Head');
  for (let k = 0; k < 40; k++) await call(admin, 'POST', '/records/inventory', { itemCode: `LD-${k}`, price: 100 + k, inward: 50, outward: 0, minStock: 5 });

  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const deadline = Date.now() + SECONDS * 1000;
  let n = 0;
  async function actor(u) {
    while (Date.now() < deadline) {
      n++;
      const t = u.token;
      switch (u.role) {
        case 'Lead Filler': {
          await call(t, 'POST', '/records/leads', { companyName: `Co ${n}`, customerName: 'C', phone: `98${String(n).padStart(8, '0')}`, salesHead: pick(heads).id, category: pick(['Product', 'Service']) });
          await call(t, 'GET', '/records/leads?limit=200');
          await call(t, 'GET', '/notifications/count');
          break;
        }
        case 'Sales Head': {
          const list = (await call(t, 'GET', '/records/leads?status=New%20Lead&limit=20')).data.items;
          const sellers = users.filter((x) => x.role === 'Sales Employee');
          if (list.length) await call(t, 'PUT', `/records/leads/${list[0].id}`, { assignedTo: pick(sellers).id });
          await call(t, 'GET', '/records/quotations?limit=50');
          await call(t, 'GET', '/notifications?limit=30');
          break;
        }
        case 'Sales Employee': {
          const mine = (await call(t, 'GET', '/records/leads?limit=50')).data.items;
          const l = mine.find((x) => x.status === 'Assigned');
          if (l) {
            await call(t, 'POST', '/records/quotations', { customerName: l.companyName, enquiryNo: l.enqNo, status: 'Sent', gst: 18, products: [{ description: 'Panel', quantity: 2, unitPrice: 1000 }] });
            const r = await call(t, 'PUT', `/records/leads/${l.id}`, { status: pick(['Closed: Won', 'Closed: Lost', 'Quoted']) }, true);
            // two Sales Heads can hand the same new enquiry to different people at the same moment; the later one wins
            if (r.status === 403) stats.reassigned.push({ lead: l.id, seller: u.id });
            else if (r.status !== 200) stats.errors.push(`${r.status} PUT lead ${l.id}`);
          }
          await call(t, 'POST', '/records/salesOrders', { customer: 'SO', gst: 18, items: [{ itemName: 'x', quantity: 1, unitPrice: 100 }] });
          await call(t, 'GET', '/records/customers?limit=50');
          break;
        }
        case 'Inventory Manager':
        case 'Stock Filler': {
          const inv = (await call(t, 'GET', '/records/inventory?limit=100')).data.items;
          const it = pick(inv);
          await call(t, 'PUT', `/records/inventory/${it.id}`, { outward: (it.outward || 0) + 1 });
          await call(t, 'POST', '/records/poRequests', { companyName: 'Supplier', financialYear: '26-27', gst: 18, products: [{ description: 'x', quantity: 1, unitPrice: 10 }] });
          await call(t, 'POST', '/records/pi', { customerName: 'Cust', gst: 18, items: [{ itemName: 'x', quantity: 1, unitPrice: 10 }] });
          break;
        }
        case 'Engineer':
        case 'Service Engineer': {
          await call(t, 'POST', '/records/workVisits', { company: 'Plant', visitDate: '2026-10-24' });
          await call(t, 'POST', '/records/serviceDetails', { client: 'Plant' });
          if (u.role === 'Engineer') await call(t, 'POST', '/records/productRequests', { company: 'Plant', products: [{ name: 'MCB', quantity: 1 }] });
          await call(t, 'GET', '/records/leads', null, u.role === 'Engineer'); // Engineers have no enquiries: 403 expected
          break;
        }
        default: break;
      }
    }
  }
  const t0 = Date.now();
  await Promise.all([...users.map(actor), (async () => { while (Date.now() < deadline) { await call(admin, 'GET', '/records/leads?limit=100'); await call(admin, 'GET', '/stats'); } })()]);
  const secs = (Date.now() - t0) / 1000;

  // ---- checks after the storm ----
  const checks = [];
  const ok = (c, name, extra) => { checks.push(!!c); console.log(`${c ? 'PASS' : 'FAIL'} ${name}${c ? '' : ` -> ${JSON.stringify(extra).slice(0, 300)}`}`); };
  const all = async (m) => (await call(admin, 'GET', `/records/${m}?limit=5000`)).data.items;
  const leads = await all('leads');
  const dup = (arr) => arr.length - new Set(arr).size;
  ok(dup(leads.map((x) => x.enqNo)) === 0, `${leads.length} enquiries, all enquiry numbers unique`);
  const pos = await all('poRequests');
  ok(dup(pos.map((x) => x.docNumber)) === 0, `${pos.length} purchase orders, all PO numbers unique`);
  const pis = await all('pi');
  ok(dup(pis.map((x) => x.piNumber)) === 0, `${pis.length} proforma invoices, all PI numbers unique`);
  const qs = await all('quotations');
  ok(dup(qs.map((x) => x.referenceNo)) === 0, `${qs.length} quotations, all reference numbers unique`);
  ok(qs.every((q) => q.totalPayable === 2360), 'every quotation total still right (2 x 1000 + 18% GST)');
  const inv = await all('inventory');
  ok(inv.every((i) => i.current === (i.inward || 0) - (i.outward || 0)), 'inventory current stock consistent');
  const sellers = users.filter((x) => x.role === 'Sales Employee');
  let leak = 0;
  for (const s of sellers) {
    const mine = (await call(s.token, 'GET', '/records/leads?limit=5000')).data.items;
    leak += mine.filter((x) => String(x.assignedTo) !== String(s.id) && x.createdBy !== s.id).length;
  }
  ok(leak === 0, 'Sales Employees still see only their own enquiries');
  const won = leads.filter((x) => x.status === 'Closed: Won');
  const cust = await all('customers');
  ok(won.every((w) => cust.some((c) => c.phone === w.phone)), `${won.length} won enquiries all became customers`);
  const re = stats.reassigned.filter((x) => String(leads.find((l) => l.id === x.lead)?.assignedTo) === String(x.seller));
  ok(re.length === 0, `${stats.reassigned.length} "Not allowed" answers, every one because the enquiry had just been given to someone else`, re);
  const t = stats.times.sort((a, b) => a - b);
  const pct = (p) => t[Math.min(t.length - 1, Math.floor(t.length * p))];
  ok(stats.errors.length === 0, `no failed requests (${stats.calls} requests)`, stats.errors.slice(0, 5));
  console.log(`\n${USERS} users for ${secs.toFixed(0)} s: ${stats.calls} requests (${(stats.calls / secs).toFixed(0)}/s), response time median ${pct(0.5)} ms, 95% under ${pct(0.95)} ms, slowest ${t[t.length - 1]} ms`);
  console.log(`RESULT ${checks.filter(Boolean).length} / ${checks.length} passed`);
  server.close();
  process.exit(checks.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
