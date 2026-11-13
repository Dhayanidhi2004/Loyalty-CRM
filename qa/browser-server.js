// Runs the real CRM (API + built website) on an in-memory Postgres with sample data for every login, for browser testing.
//   cd client && npm run build      (once)
//   cd qa && node browser-server.js [port]      -> http://localhost:5173  (password for every login: Pass@123)
// Logins: admin@qa.test, head@qa.test, sales@qa.test, eng@qa.test, svc@qa.test, invmgr@qa.test, filler@qa.test, stock@qa.test
const path = require('path');
const fs = require('fs');
const Module = require('module');

const SERVER = path.join(__dirname, '..', 'server');
const DIST = process.env.CLIENT_DIST || path.join(__dirname, '..', 'client', 'dist');
const PORT = Number(process.argv[2]) || 5173;
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
  const express = require(path.join(SERVER, 'node_modules', 'express'));
  const app = express();
  app.use(require(path.join(SERVER, 'src', 'app.js')));
  app.use(express.static(DIST));
  app.get(/^\/(?!api|uploads).*/, (_q, res) => res.sendFile(path.join(DIST, 'index.html')));
  await new Promise((ok) => app.listen(PORT, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${PORT}/api`;
  const T = {};
  const call = async (who, method, p, body) => {
    const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${T[who]}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${JSON.stringify(data)}`);
    return data;
  };
  T.admin = (await call(null, 'POST', '/auth/login', { email: 'admin@qa.test', password: 'Pass@123' })).token;
  const ID = {};
  const staff = [['head', 'Sales Head', 'Priya Head'], ['sales', 'Sales Employee', 'Arun Sales'], ['eng', 'Engineer', 'Karthik Eng'], ['svc', 'Service Engineer', 'Vel Service'],
    ['invmgr', 'Inventory Manager', 'Meena Stores'], ['filler', 'Lead Filler', 'Divya Leads'], ['stock', 'Stock Filler', 'Ravi Stock']];
  for (const [k, designation, name] of staff) {
    const u = await call('admin', 'POST', '/employees', { name, email: `${k}@qa.test`, password: 'Pass@123', designation, phone: '9840012345', department: 'Operations', joining_date: '2025-06-01', resources: [{ name: 'Laptop', code: 'LP-' + k, status: 'provided' }] });
    ID[k] = u.id;
    T[k] = (await call(null, 'POST', '/auth/login', { email: `${k}@qa.test`, password: 'Pass@123' })).token;
  }
  // sample data in every section
  const leads = [];
  const cos = [['Sri Pumps Pvt Ltd', 'Ravi Kumar', 'Product', 'Hot'], ['Kavya Textiles', 'Anitha', 'Service', 'High'], ['NK Industries', 'Suresh', 'Product', 'Warm'], ['Rambal Ltd', 'Mohan', 'Product', 'Low'], ['LNT Panels', 'Prakash', 'Service', 'Warm']];
  for (const [i, [companyName, customerName, category, priority]] of cos.entries()) {
    leads.push(await call(i % 2 ? 'filler' : 'admin', 'POST', '/records/leads', { companyName, customerName, phone: `98400${10000 + i}`, email: `c${i}@example.com`, city: 'Chennai', category, priority, source: 'Email', salesHead: ID.head, requirement: `Requirement ${i}` }));
  }
  await call('head', 'PUT', `/records/leads/${leads[0].id}`, { assignedTo: ID.sales });
  await call('head', 'PUT', `/records/leads/${leads[2].id}`, { assignedTo: ID.sales, status: 'Closed: Won' });
  await call('head', 'PUT', `/records/leads/${leads[3].id}`, { status: 'Closed: Lost' });
  await call('sales', 'POST', '/records/quotations', { customerName: 'Sri Pumps Pvt Ltd', enquiryNo: leads[0].enqNo, status: 'Sent', gst: 18, paymentDue: '100% advance', validity: '1 week', products: [{ description: '3 HP pump', hsnCode: '8413', uom: 'Nos', quantity: 12, unitPrice: 14500 }] });
  await call('admin', 'POST', '/records/quotationRequests', { customerName: 'Ravi', companyName: 'Sri Pumps Pvt Ltd', product: 'VFD 2HP', quantity: 2 });
  await call('invmgr', 'POST', '/records/poRequests', { companyName: 'Delta Electronics', financialYear: '26-27', gst: 18, paymentTerms: '30 days credit', products: [{ description: 'VFD 2HP', hsnCode: '8504', uom: 'Nos', quantity: 4, unitPrice: 12000 }] });
  await call('invmgr', 'POST', '/records/pi', { customerName: 'NK Industries', address: 'Chennai', gst: 18, discount: 5, freight: 500, items: [{ itemName: 'Control panel', uom: 'Set', quantity: 1, unitPrice: 245000 }] });
  await call('sales', 'POST', '/records/salesOrders', { customer: 'NK Industries', gst: 18, items: [{ itemName: 'Panel', quantity: 1, unitPrice: 245000 }] });
  await call('eng', 'POST', '/records/workVisits', { company: 'Kavya Textiles', visitDate: '2026-10-20', machine: 'Compressor', complaints: 'Not starting', assessment: 'Contactor replaced' });
  await call('eng', 'POST', '/records/serviceDetails', { client: 'Kavya Textiles', model: 'AC-55', serviceStatus: 'In Progress', billingStatus: 'Pending' });
  await call('eng', 'POST', '/records/productRequests', { company: 'Kavya Textiles', contactPerson: 'Anitha', products: [{ name: 'Contactor 9A', quantity: 2 }] });
  for (const p of [['LC1D09', 'TeSys D', 'Schneider', 1250, 40, 5, 10], ['A9F74210', 'Acti9', 'Schneider', 380, 60, 8, 15], ['VFD022EL43A', 'VFD-EL', 'Delta', 16900, 3, 2, 2]]) {
    await call('invmgr', 'POST', '/records/inventory', { itemCode: p[0], model: p[1], brand: p[2], price: p[3], inward: p[4], outward: p[5], minStock: p[6] });
  }
  await call('admin', 'POST', '/records/customers', { companyName: 'Rambal Ltd', gst: '33AABCR1234A1Z5', contactPerson: 'Mohan', phone: '9840022222', email: 'mohan@rambal.in', address: 'Chennai' });
  await call('sales', 'POST', '/project-quotations', { cust: 'NK Industries', proj: 'Control panel', ref: 'LA/PQ/1', price: 245000, gst: 18, items: [{ d: 'PLC', q: 1 }, { d: 'HMI', q: 1 }] });
  console.log(`BROWSER SERVER READY on http://localhost:${PORT}`);
})().catch((e) => { console.error(e); process.exit(1); });
