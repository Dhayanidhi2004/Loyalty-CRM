// Email lead -> Draft quotation. Real records router + real Postgres (PGlite). Run: node draft-quotation.test.js
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const Module = require('module');
const SERVER = path.join(__dirname, '..', 'server');
process.env.DATABASE_URL = 'postgres://qa:qa@localhost:5432/qa';
process.env.JWT_SECRET = 'qa-secret';

(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const toNum = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])));
  const run = async (t, p) => { const r = await db.query(t, p); return { rows: toNum(r.rows), rowCount: r.affectedRows ?? r.rows.length }; };
  class Pool { query(t, p) { return run(t, p); } async connect() { return { query: (t, p) => run(t, p), release() {} }; } on() {} }
  const orig = Module._load;
  Module._load = function (r, ...a) { return r === 'pg' ? { Pool, types: { setTypeParser() {} } } : orig.call(this, r, ...a); };
  await db.exec(fs.readFileSync(path.join(SERVER, 'supabase', 'schema.sql'), 'utf8'));

  const { signToken } = require(path.join(SERVER, 'src', 'auth.js'));
  const ids = {}; const tok = {};
  for (const [k, d, role] of [['admin', 'Admin', 'admin'], ['head', 'Sales Head', 'employee'], ['emp', 'Sales Employee', 'employee'], ['filler', 'Lead Filler', 'employee'], ['filler2', 'Lead Filler', 'employee']]) {
    const r = await db.query('insert into crm_users (name, email, password_hash, role, designation) values ($1,$2,$3,$4,$5) returning id', [k, `${k}@qa.test`, 'x', role, d]);
    ids[k] = Number(r.rows[0].id); tok[k] = signToken({ id: ids[k], role });
  }
  const express = require(path.join(SERVER, 'node_modules', 'express'));
  const app = express(); app.use(express.json());
  app.use('/api/records', require(path.join(SERVER, 'src', 'routes', 'records.js')));
  app.use((e, _q, res, _n) => res.status(500).json({ message: String(e.message || e) }));
  const srv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api/records`;
  const call = async (who, method, url, body) => {
    const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok[who]}` }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const emailLead = async (user, msg, subject, body) => Number((await db.query(
    "insert into crm_email_leads (user_id, message_id, from_name, from_email, subject, body, company, phone, status) values ($1,$2,'Ravi','ravi@sripumps.in',$3,$4,'Sri Pumps','+91 98400 12345','new') returning id", [user, msg, subject, body])).rows[0].id);
  const leadBody = (extra) => ({ companyName: 'Sri Pumps', customerName: 'Ravi', phone: '9840012345', source: 'Email', requirement: 'Need 2 nos 5HP motors', salesHead: ids.head, ...extra });
  const quotes = async (who = 'head') => (await call(who, 'GET', '/quotations')).body.items;
  let n = 0; const ok = (m) => console.log(`  ✓ ${++n}. ${m}`);

  // 1. converting an email lead creates a Draft quotation
  const el1 = await emailLead(ids.filler, 'm1', 'Re: RFQ for 5HP motors', 'Dear sir, kindly send quotation for 2 nos 5HP motors.');
  const c1 = await call('filler', 'POST', '/leads', leadBody({ emailLeadId: String(el1) }));
  assert.strictEqual(c1.status, 201, JSON.stringify(c1.body));
  const lead1 = c1.body;
  let q = await quotes();
  assert.strictEqual(q.length, 1); const d = q[0];
  assert.strictEqual(d.status, 'Draft'); assert.strictEqual(d.enquiryNo, lead1.enqNo); assert.strictEqual(d.customerName, 'Sri Pumps');
  assert.strictEqual(d.products[0].description, 'RFQ for 5HP motors'); assert.strictEqual(d.products[0].unitPrice, null);
  assert.strictEqual(d.totalPayable, 0); assert.ok(!d.referenceNo, 'no reference number consumed by a draft');
  assert.strictEqual(d.createdBy, ids.head); ok('email lead -> Draft quotation (customer, enquiry no, subject as first item, no prices/ref no), owned by Sales Head');

  // 2. the lead is NOT marked Quoted, and the Lead Filler can't see quotations
  assert.strictEqual((await call('head', 'GET', `/leads/${lead1.id}`)).body.status, 'New Lead');
  assert.strictEqual((await call('filler', 'GET', '/quotations')).status, 403); ok('enquiry stays "New Lead"; Lead Filler still has no Quotations access');

  // 3. editing the draft keeps it a draft and the enquiry un-quoted
  const e = await call('head', 'PUT', `/quotations/${d.id}`, { enquiryNo: d.enquiryNo, customerName: 'Sri Pumps Pvt Ltd', gst: 18, products: [{ description: '5HP motor', quantity: 2, unitPrice: 12000 }] });
  assert.strictEqual(e.status, 200, JSON.stringify(e.body));
  assert.strictEqual(e.body.status, 'Draft'); assert.strictEqual(e.body.totalPayable, 28320); assert.ok(e.body.referenceNo, 'reference no assigned on first edit');
  assert.strictEqual((await call('head', 'GET', `/leads/${lead1.id}`)).body.status, 'New Lead'); ok('editing the draft (prices, GST) keeps Draft + "New Lead"; totals calculate; ref no assigned');

  // 4. sending it moves the enquiry to Quoted
  assert.strictEqual((await call('head', 'PUT', `/quotations/${d.id}`, { status: 'Sent' })).status, 200);
  assert.strictEqual((await call('head', 'GET', `/leads/${lead1.id}`)).body.status, 'Quoted'); ok('Draft -> Sent moves the enquiry to "Quoted"');

  // 5. assigning the enquiry hands the draft to that employee
  const el2 = await emailLead(ids.filler, 'm2', 'Pump spares required', 'We need seals and bearings.');
  const lead2 = (await call('filler', 'POST', '/leads', leadBody({ emailLeadId: String(el2), companyName: 'Hari Mills' }))).body;
  assert.strictEqual((await quotes('emp')).length, 0);
  assert.strictEqual((await call('head', 'PUT', `/leads/${lead2.id}`, { assignedTo: ids.emp })).status, 200);
  const mine = await quotes('emp');
  assert.strictEqual(mine.length, 1); assert.strictEqual(mine[0].customerName, 'Hari Mills'); assert.strictEqual(mine[0].status, 'Draft'); ok('assigning the enquiry moves its draft to the Sales Employee (who only sees their own)');

  // 6. nothing is created for a made-up or someone else's email lead, or a lead not from email
  const total = async () => (await quotes()).length;
  const before = await total();
  await call('filler', 'POST', '/leads', leadBody({ emailLeadId: '99999' }));
  const other = await emailLead(ids.filler2, 'm3', 'Other', 'x');
  await call('filler', 'POST', '/leads', leadBody({ emailLeadId: String(other) }));
  await call('filler', 'POST', '/leads', leadBody({}));
  assert.strictEqual(await total(), before); ok('no draft for a fake emailLeadId, another user\'s email lead, or a plain enquiry');

  // 7. regression: a quotation made by hand still moves its enquiry to Quoted
  const lead3 = (await call('filler', 'POST', '/leads', leadBody({ companyName: 'Manual Co' }))).body;
  const man = await call('head', 'POST', '/quotations', { enquiryNo: lead3.enqNo, customerName: 'Manual Co', products: [{ description: 'x', quantity: 1, unitPrice: 5 }] });
  assert.strictEqual(man.status, 201); assert.notStrictEqual(man.body.status, 'Draft');
  assert.strictEqual((await call('head', 'GET', `/leads/${lead3.id}`)).body.status, 'Quoted'); ok('manually created quotations still mark the enquiry "Quoted"');

  console.log(`\nAll ${n} checks passed`);
  srv.close(); process.exit(0);
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
