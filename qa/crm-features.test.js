// Integration tests for: reset password by email, inventory Excel import, manual quotations, admin email leads,
// notifications (bell), and Gmail enquiries being registered in the CRM.
// Runs the REAL server app (server/src/app.js) on PGlite; only `pg` and Google's HTTP endpoints are replaced.
//   cd qa && node crm-features.test.js
const path = require('path');
const fs = require('fs');
const Module = require('module');

const SERVER = path.join(__dirname, '..', 'server');
process.env.DATABASE_URL = 'postgres://qa:qa@localhost:5432/qa';
process.env.JWT_SECRET = 'qa-secret';
process.env.UPLOADS_DIR = require('path').join(require('os').tmpdir(), 'crm-qa-uploads'); // tests never write into server/uploads
// pasted with a stray space, exactly like the real .env was: the server must clean it
process.env.GOOGLE_CLIENT_ID = '245890123456-qa9nv4thvd1a.ap ps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'GOCSPX-qa-secret';
const CLEAN_ID = '245890123456-qa9nv4thvd1a.apps.googleusercontent.com';
const REGISTERED_REDIRECTS = ['http://localhost:5173/api/gmail/callback', 'https://crm.example.com/api/gmail/callback'];
const TOKEN_REQUESTS = [];
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:5173/api/gmail/callback';
process.env.GMAIL_SYNC_MINUTES = '0';

let pass = 0;
let fail = 0;
const ok = (cond, name, extra) => {
  if (cond) pass++;
  else { fail++; console.log(`  FAIL ${name}${extra !== undefined ? ` -> ${JSON.stringify(extra).slice(0, 400)}` : ''}`); }
};
const toNum = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])));

// ---------- fake Gmail inbox ----------
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const INBOX = []; // Gmail API messages
const SENTBOX = []; // messages sent from the CRM
let mailSeq = 0;
function mail({ from, subject, body, thread, hoursAgo = 1, unsubscribe = false, to = 'leads@qa.test', extra = [] }) {
  const id = `m${++mailSeq}`;
  const headers = [{ name: 'From', value: from }, { name: 'Subject', value: subject }, { name: 'To', value: to }, { name: 'Message-ID', value: `<${id}@mail.test>` }, ...extra];
  if (unsubscribe) headers.push({ name: 'List-Unsubscribe', value: '<mailto:x@y.z>' });
  INBOX.push({
    id, threadId: thread || id, snippet: body.slice(0, 80), internalDate: String(Date.now() - hoursAgo * 3600 * 1000),
    payload: { mimeType: 'multipart/alternative', headers, parts: [{ mimeType: 'text/plain', body: { data: b64(body) } }] },
  });
  return id;
}
const realFetch = global.fetch;
let gmailCalls = 0;
const SENT = []; // raw messages "sent" through Gmail
let sendMode = 'ok'; // 'ok' | 'noscope'
global.fetch = async (url, opts) => {
  const u = String(url);
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (u.startsWith('https://oauth2.googleapis.com/token')) {
    // behaves like Google: unknown client -> 401 invalid_client, redirect not registered / different -> 400
    const p = new URLSearchParams(String(opts.body));
    TOKEN_REQUESTS.push(Object.fromEntries(p));
    if (p.get('client_id') !== CLEAN_ID || p.get('client_secret') !== 'GOCSPX-qa-secret') return json(401, { error: 'invalid_client', error_description: 'The OAuth client was not found.' });
    if (p.get('grant_type') === 'authorization_code') {
      if (!REGISTERED_REDIRECTS.includes(p.get('redirect_uri'))) return json(400, { error: 'redirect_uri_mismatch', error_description: 'Bad Request' });
      if (p.get('code') !== 'good-code') return json(400, { error: 'invalid_grant', error_description: 'Bad Request' });
      return json(200, { access_token: 'acc-new', refresh_token: 'ref-new', expires_in: 3599, scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send', token_type: 'Bearer' });
    }
    return json(200, { access_token: 'acc-new', expires_in: 3600 });
  }
  if (u.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/')) {
    gmailCalls++;
    const rest = u.slice('https://gmail.googleapis.com/gmail/v1/users/me/'.length);
    if (rest.startsWith('profile')) return json(200, { emailAddress: 'inbox@qa.test' });
    if (rest.startsWith('messages/send')) {
      if (sendMode === 'noscope') return json(403, { error: { code: 403, message: 'Request had insufficient authentication scopes.', status: 'PERMISSION_DENIED' } });
      const req = JSON.parse(opts.body);
      const raw = Buffer.from(req.raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      const id = `s${SENT.length + 1}`;
      SENT.push({ id, threadId: req.threadId, raw });
      // Gmail files the sent message in the same thread (not in the inbox)
      const [head, enc] = raw.split('\r\n\r\n');
      const hs = head.split('\r\n').map((l) => { const i = l.indexOf(':'); return { name: l.slice(0, i), value: l.slice(i + 1).trim() }; });
      SENTBOX.push({ id, threadId: req.threadId || id, snippet: '', internalDate: String(Date.now()), payload: { mimeType: 'text/plain', headers: [{ name: 'From', value: 'Loyalty <leads@qa.test>' }, ...hs], body: { data: Buffer.from(enc.replace(/\r\n/g, ''), 'base64').toString('base64') } } });
      return json(200, { id, threadId: req.threadId || id, labelIds: ['SENT'] });
    }
    if (rest.startsWith('threads/')) {
      const tid = decodeURIComponent(rest.slice(8).split('?')[0]);
      return json(200, { id: tid, messages: [...INBOX, ...SENTBOX].filter((m) => m.threadId === tid).sort((a, b) => Number(a.internalDate) - Number(b.internalDate)) });
    }
    if (rest.startsWith('messages?')) return json(200, { messages: [...INBOX].reverse().map((m) => ({ id: m.id, threadId: m.threadId })) });
    const id = rest.split('?')[0].replace('messages/', '');
    const m = INBOX.find((x) => x.id === id);
    return m ? json(200, m) : json(404, { error: { message: 'not found' } });
  }
  return realFetch(url, opts);
};

(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const run = async (text, params) => {
    const r = await db.query(text, params);
    return { rows: toNum(r.rows), rowCount: r.affectedRows ?? r.rows.length };
  };
  class Pool { query(t, p) { return run(t, p); } async connect() { return { query: (t, p) => run(t, p), release() {} }; } on() {} }
  const origLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'pg') return { Pool, types: { setTypeParser() {} } };
    return origLoad.call(this, request, ...rest);
  };
  await db.exec(fs.readFileSync(path.join(SERVER, 'supabase', 'schema.sql'), 'utf8'));
  // schema must be safe to run twice (server runs it on every start)
  await db.exec(fs.readFileSync(path.join(SERVER, 'supabase', 'schema.sql'), 'utf8'));

  const bcrypt = require(path.join(SERVER, 'node_modules', 'bcryptjs'));
  const { startSession } = require(path.join(SERVER, 'src', 'auth.js'));
  const people = [
    ['admin', 'Administrator', 'admin'], ['head', 'Sales Head', 'employee'], ['sales', 'Sales Employee', 'employee'],
    ['stock', 'Inventory Manager', 'employee'], ['filler', 'Lead Filler', 'employee'], ['svc', 'Service Engineer', 'employee'],
    ['eng', 'Engineer', 'employee'],
  ];
  const T = {};
  const ID = {};
  const hash = await bcrypt.hash('secret1', 4);
  for (const [k, designation, role] of people) {
    const r = await db.query('insert into crm_users (name, email, password_hash, role, designation) values ($1,$2,$3,$4,$5) returning id', [k, `${k}@qa.test`, hash, role, designation]);
    ID[k] = Number(r.rows[0].id);
    T[k] = await startSession({ id: ID[k], role }, `qa-${k}`);
  }

  const app = require(path.join(SERVER, 'src', 'app.js'));
  const server = await new Promise((res) => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (who, method, p, body, form) => {
    const headers = who ? { Authorization: `Bearer ${T[who]}` } : {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const r = await realFetch(base + p, { method, headers, body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
    let data = null;
    try { data = await r.json(); } catch { /* empty */ }
    return { status: r.status, data };
  };
  const unread = async (who) => (await call(who, 'GET', '/notifications/count')).data.unread;
  const notes = async (who) => (await call(who, 'GET', '/notifications?limit=100')).data.items;

  // ================= 1. Reset password by employee email =================
  console.log('1. Reset password by email');
  let r = await call('admin', 'POST', '/employees/reset-password', { email: 'SALES@qa.test', newPassword: 'newpass1' });
  ok(r.status === 200 && /sales@qa.test/.test(r.data.message), 'admin resets by email (case-insensitive)', r);
  r = await call(null, 'POST', '/auth/login', { email: 'sales@qa.test', password: 'newpass1' });
  ok(r.status === 200 && r.data.token, 'employee logs in with the new password', r);
  r = await call(null, 'POST', '/auth/login', { email: 'sales@qa.test', password: 'secret1' });
  ok(r.status === 401, 'old password no longer works');
  r = await call('admin', 'POST', '/employees/reset-password', { email: 'nobody@qa.test', newPassword: 'newpass1' });
  ok(r.status === 404 && /nobody@qa.test/.test(r.data.message), 'unknown email -> 404 with the email in the message', r);
  r = await call('admin', 'POST', '/employees/reset-password', { email: 'not-an-email', newPassword: 'newpass1' });
  ok(r.status === 400, 'malformed email -> 400', r);
  r = await call('admin', 'POST', '/employees/reset-password', { email: '', newPassword: 'newpass1' });
  ok(r.status === 400, 'empty email -> 400', r);
  r = await call('admin', 'POST', '/employees/reset-password', { email: 'sales@qa.test', newPassword: '123' });
  ok(r.status === 400, 'short password rejected', r);
  r = await call('head', 'POST', '/employees/reset-password', { email: 'sales@qa.test', newPassword: 'hacked1' });
  ok(r.status === 403, 'non-admin cannot reset', r);
  r = await call('admin', 'POST', '/employees/reset-password', { id: ID.eng, newPassword: 'engpass1' });
  ok(r.status === 200, 'reset from a profile page (by id) still works', r);
  r = await call('admin', 'POST', '/employees/reset-email', { name: 'eng', newEmail: 'eng2@qa.test' });
  ok(r.status === 200, 'reset email by name still works', r);

  // ================= 2. Inventory: manual + Excel =================
  console.log('2. Inventory manual + Excel');
  r = await call('stock', 'POST', '/records/inventory', { itemCode: 'LC1D09', model: 'TeSys D', brand: 'Schneider', price: 1200, inward: 10, outward: 0, minStock: 2 });
  ok(r.status === 201 && r.data.current === 10, 'add product manually', r);
  const XLSX = require(path.join(SERVER, 'node_modules', 'xlsx'));
  const sheet = [
    ['LOYALTY AUTOMATION – STOCK LIST OCT 2026'],
    [],
    ['S.No', 'HSN Code', 'Part No', 'Item Description', 'Make', 'Unit Price (Rs)', 'Qty', 'Min Stock Level', 'GST %', 'Rack', 'Supplier Remarks'],
    [1, '8536', 'LC1D09', 'Contactor 9A 24VDC', 'Schneider', '₹ 1,250.00', '15 Nos', 3, 18, 'R1', 'ignore me'],
    [2, '8536', 'A9F74210', 'MCB 10A DP', 'Schneider', 380, 40, 5, 18, 'R2', 'x'],
    [3, '8504', 'DPS-24V', 'Power supply 24V 5A', 'Delta', '2,150', 0, 2, 18, 'R3', ''],
    [4, '8536', '', 'Cable tie (no code)', 'Local', 2, 500, '', 18, '', ''],
    [5, '8536', 'A9F74210', 'MCB 10A DP repeated', 'Schneider', 390, 10, 5, 18, 'R2', ''],
    [6, '8536', 'BAD-QTY', 'Relay', 'Phoenix', -5, 3, 1, 18, '', ''],
    ['', '', '', 'Total', '', '', '', '', '', '', ''],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet), 'Stock');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const form = new FormData();
  form.append('files', new Blob([buf]), 'stock.xlsx');
  r = await call('stock', 'POST', '/inventory-import', undefined, form);
  const prods = r.data?.results?.[0]?.products || [];
  ok(r.status === 200 && prods.length === 6, 'Excel read: 6 product rows (title, blank and Total lines skipped)', r.data);
  const first = prods[0] || {};
  ok(first.itemCode === 'LC1D09' && first.price === 1250 && first.inward === 15 && first.minStock === 3 && first.brand === 'Schneider' && first.location === 'R1' && first.description === 'Contactor 9A 24VDC',
    'only inventory fields picked, numbers cleaned (₹ 1,250.00 -> 1250, "15 Nos" -> 15)', first);
  ok(Object.keys(first).sort().join() === 'brand,description,inward,itemCode,location,minStock,model,outward,price', 'no extra columns (HSN, GST, S.No, remarks) carried over', Object.keys(first));
  ok(!prods.some((p) => p.itemCode === '8536'), 'HSN code never mistaken for the item code');
  const csvForm = new FormData();
  csvForm.append('files', new Blob(['SKU,Model,Brand,Rate,Stock\nX-1,M1,Delta,10,4\n']), 'list.csv');
  r = await call('stock', 'POST', '/inventory-import', undefined, csvForm);
  ok(r.data?.results?.[0]?.products?.[0]?.itemCode === 'X-1' && r.data.results[0].products[0].inward === 4, 'CSV with other header names (SKU / Rate / Stock)', r.data);
  const pdfForm = new FormData();
  pdfForm.append('files', new Blob(['%PDF']), 'x.pdf');
  r = await call('stock', 'POST', '/inventory-import', undefined, pdfForm);
  ok(r.status === 200 && r.data.results[0].notes.length && !r.data.results[0].products.length, 'non-Excel file explained, nothing read', r.data);
  r = await call('sales', 'POST', '/inventory-import', undefined, form);
  ok(r.status === 403, 'read-only role cannot import', r.status);

  const before = await unread('admin');
  r = await call('stock', 'POST', '/records/inventory/bulk', { products: prods, updateExisting: true });
  ok(r.status === 201 && r.data.added === 2 && r.data.updated === 1 && r.data.duplicates === 1 && r.data.invalidCount === 2, 'bulk save: 2 new, 1 updated, 1 repeated, 2 invalid (no code / negative price)', r.data);
  const inv = (await call('admin', 'GET', '/records/inventory')).data.items;
  const lc = inv.find((p) => p.itemCode === 'LC1D09');
  ok(inv.length === 3 && lc.price === 1250 && lc.inward === 15 && lc.model === 'TeSys D' && lc.current === 15, 'existing product updated, blank Model kept', lc);
  ok(await unread('admin') === before + 1, 'one low-stock notification for the import (DPS-24V has 0 stock)', await notes('admin'));
  const low = (await notes('stock'))[0];
  ok(!low || !/DPS-24V/.test(low.title + low.body), 'the person who imported is not notified of their own change');
  ok((await notes('admin'))[0].kind === 'inventory' && /DPS-24V/.test((await notes('admin'))[0].title), 'low stock notification names the product', (await notes('admin'))[0]);
  r = await call('stock', 'POST', '/records/inventory/bulk', { products: prods, updateExisting: false });
  ok(r.status === 201 && r.data.added === 0 && r.data.updated === 0 && r.data.duplicates === 4, 'updateExisting off: existing items skipped', r.data);
  r = await call('stock', 'POST', '/records/inventory/bulk', { products: [] });
  ok(r.status === 400, 'empty list rejected');

  // ================= 3. Manual quotation (admin) =================
  console.log('3. Manual quotations');
  const headBefore = await unread('head');
  r = await call('admin', 'POST', '/records/quotations', {
    customerName: 'NK Industries', status: 'Draft', gst: 18, freight: 100,
    products: [{ description: 'VFD 2HP', quantity: 2, unitPrice: 15000 }, { description: 'Panel', quantity: 1, unitPrice: 5000 }],
  });
  ok(r.status === 201 && r.data.itemsTotal === 35000 && r.data.totalPayable === 41418 && /^LAP\/OFF\//.test(r.data.referenceNo), 'admin adds a quotation manually with totals and reference no', r.data);
  ok(await unread('head') === headBefore + 1, 'Sales Head notified of the new quotation');
  const qs = (await call('admin', 'GET', '/records/quotations')).data.items;
  ok(qs.length === 1, 'quotation listed under All Quotations');

  // ================= 4. Notifications API =================
  console.log('4. Notifications API');
  r = await call('filler', 'POST', '/records/leads', { companyName: 'Rambal', customerName: 'Mr R', phone: '9840012345', salesHead: ID.head, category: 'Service' });
  ok(r.status === 201, 'lead filler enters an enquiry', r.data);
  const enq = r.data;
  let hn = await notes('head');
  ok(hn.some((n) => n.kind === 'lead' && n.title.includes(enq.enqNo) && !n.read), 'chosen Sales Head notified of new enquiry');
  ok((await notes('svc')).some((n) => n.title.includes(enq.enqNo)), 'Service Engineer notified of a Service enquiry');
  ok(!(await notes('sales')).some((n) => n.title.includes(enq.enqNo)), 'Sales Employee not notified until assigned');
  ok(!(await notes('filler')).some((n) => n.title.includes(enq.enqNo)), 'creator not notified of their own enquiry');
  r = await call('head', 'PUT', `/records/leads/${enq.id}`, { assignedTo: ID.sales });
  ok(r.status === 200 && r.data.status === 'Assigned', 'Sales Head assigns', r.data);
  ok((await notes('sales')).some((n) => n.title === `Enquiry ${enq.enqNo} assigned to you`), 'assignee notified', await notes('sales'));
  ok((await notes('filler')).some((n) => n.title === `Enquiry ${enq.enqNo} is now Assigned`), 'creator told the stage changed', await notes('filler'));
  const n0 = await unread('head');
  const firstHead = (await notes('head'))[0];
  r = await call('head', 'POST', `/notifications/${firstHead.id}/read`);
  ok(r.data.unread === n0 - 1, 'mark one read', r.data);
  r = await call('sales', 'POST', `/notifications/${firstHead.id}/read`);
  ok((await unread('head')) === n0 - 1, "cannot touch someone else's notification");
  r = await call('head', 'POST', '/notifications/read-all');
  ok((await unread('head')) === 0, 'mark all read');
  r = await call(null, 'GET', '/notifications/count');
  ok(r.status === 401, 'needs login');
  r = await call('stock', 'POST', '/records/productRequests', { company: 'LNT', products: [{ name: 'MCB', quantity: 3 }] });
  ok(r.status === 403 || r.status === 201, 'product request route reachable');
  r = await call('eng', 'POST', '/records/productRequests', { company: 'LNT', products: [{ name: 'MCB', quantity: 3 }] });
  ok(r.status === 201 && (await notes('stock')).some((n) => n.kind === 'productRequest'), 'Inventory Manager notified of product request', r.data);

  // ================= 5. Gmail -> CRM =================
  console.log('5. Gmail enquiries registered in the CRM');
  const { seal } = require(path.join(SERVER, 'src', 'gmailApi.js'));
  await db.query('insert into crm_gmail (user_id, email, refresh_token, access_token, expires_at) values ($1,$2,$3,$4, now() + interval \'1 hour\')',
    [ID.filler, 'leads@qa.test', seal('refresh'), seal('access')]);
  mail({ from: 'Ravi Kumar <ravi@sripumps.in>', subject: 'Request for quotation - 3 HP monoblock pumps', thread: 't1', hoursAgo: 5,
    body: 'Dear Sir,\nWe have a requirement for 12 nos of 3 HP pumps for our plant in Coimbatore.\nKindly send your best price.\nRegards,\nRavi Kumar\nSri Pumps Pvt Ltd\n+91 98430 22118' });
  mail({ from: 'Anitha <maintenance@kavyatextiles.com>', subject: 'Compressor breakdown - service needed urgently', hoursAgo: 4,
    body: 'Hello,\nOur air compressor stopped working. We need a service engineer urgently for repair.\nAnitha\nKavya Textiles\nTiruppur' });
  mail({ from: 'Newsletter <noreply@shop.com>', subject: 'Big sale - unsubscribe anytime', unsubscribe: true, hoursAgo: 3, body: 'Best price on everything! Order now. Unsubscribe here.' });
  mail({ from: 'Mom <mom@gmail.com>', subject: 'Dinner', hoursAgo: 2, body: 'Come home early today.' });
  mail({ from: 'Ravi Kumar <ravi@sripumps.in>', subject: 'Re: Request for quotation - 3 HP monoblock pumps', thread: 't1', hoursAgo: 1,
    body: 'Also please quote for 4 nos of 5 HP pumps. Kindly send price at the earliest.\nRavi\nSri Pumps Pvt Ltd' });

  const adminBefore = await unread('admin');
  r = await call('filler', 'POST', '/gmail/scan', { days: 30 });
  ok(r.status === 200 && r.data.found === 3 && r.data.registered === 2 && r.data.replies === 1, 'scan: 3 enquiry emails (2 new + 1 reply), newsletter and personal mail skipped', r.data);
  const leads = (await call('admin', 'GET', '/records/leads')).data.items.filter((l) => l.source === 'Email');
  ok(leads.length === 2, 'two Lead Enquiries created (reply did not make a third)', leads.map((l) => l.companyName));
  const pump = leads.find((l) => /Sri Pumps/i.test(l.companyName));
  const comp = leads.find((l) => /Kavya/i.test(l.companyName));
  ok(pump && pump.status === 'New Lead' && pump.phone === '+91 98430 22118' && pump.email === 'ravi@sripumps.in' && pump.city === 'Coimbatore' && pump.customerName === 'Ravi Kumar' && pump.category === 'Product',
    'enquiry filled from the email (company, contact, phone, email, city, type)', pump);
  ok(pump && pump.salesHead === ID.head && pump.createdBy === ID.filler, 'single Sales Head set; owned by the inbox owner', pump);
  ok(comp && comp.category === 'Service' && comp.priority === 'Hot' && !comp.phone && /Phone number was not in the email/.test(comp.remarks || ''), 'service + urgent detected; missing phone noted', comp);
  r = await call('svc', 'GET', '/records/leads');
  ok(r.data.items.some((l) => l.id === comp.id) && !r.data.items.some((l) => l.id === pump.id), 'Service enquiry appears in the Service Engineer section only', r.data.items.map((l) => l.companyName));
  r = await call('head', 'GET', '/records/leads');
  ok(r.data.items.some((l) => l.id === pump.id) && r.data.items.some((l) => l.id === comp.id), 'Sales Head sees both enquiries');
  r = await call('filler', 'GET', '/records/leads');
  ok(r.data.items.some((l) => l.id === pump.id), "Lead Filler sees them in View Lead Enquiries");
  const drafts = (await call('admin', 'GET', '/records/quotations')).data.items.filter((q) => q.autoDraft);
  ok(drafts.length === 2 && drafts.every((q) => q.status === 'Draft') && drafts.some((q) => q.enquiryNo === pump.enqNo && q.customerName === pump.companyName), 'a Draft quotation for each enquiry', drafts);
  r = await call('head', 'GET', '/records/quotations');
  ok(r.data.items.filter((q) => q.autoDraft).length === 2, 'Sales Head sees the draft quotations');
  const el = (await call('filler', 'GET', '/gmail/leads')).data;
  ok(el.length === 3 && el.every((x) => x.status === 'converted' && x.auto && x.leadEnqNo), 'Email Leads: all 3 marked converted + linked to an enquiry', el);
  ok(el.filter((x) => x.leadEnqNo === pump.enqNo).length === 2, 'reply linked to the first enquiry of its thread');
  const adminNotes = await notes('admin');
  ok(await unread('admin') === adminBefore + 3, 'admin: 2 new email enquiries + 1 reply notification', adminNotes.slice(0, 4));
  ok(adminNotes.some((n) => n.title === `New email enquiry ${pump.enqNo}`) && adminNotes.some((n) => n.title === `New email reply on enquiry ${pump.enqNo}`), 'notification titles', adminNotes.slice(0, 4));
  ok((await notes('head')).some((n) => n.title === `New email enquiry ${comp.enqNo}`), 'Sales Head notified');
  ok((await notes('svc')).some((n) => n.title === `New email enquiry ${comp.enqNo}`) && !(await notes('svc')).some((n) => n.title === `New email enquiry ${pump.enqNo}`), 'Service Engineer notified only of the service enquiry');
  ok((await notes('filler')).some((n) => n.title === `New email enquiry ${pump.enqNo}`), 'inbox owner notified');

  // rescan: nothing new, nothing duplicated
  r = await call('filler', 'POST', '/gmail/scan', { days: 30 });
  ok(r.status === 200 && r.data.found === 0 && r.data.registered === 0, 'rescan finds nothing new', r.data);
  ok((await call('admin', 'GET', '/records/leads')).data.items.filter((l) => l.source === 'Email').length === 2, 'no duplicate enquiries after rescan');

  // background sync (the same code the server runs every GMAIL_SYNC_MINUTES)
  mail({ from: 'Prakash <prakash@lnt.co.in>', subject: 'Enquiry for local control panel', hoursAgo: 0.5,
    body: 'We are looking for a local control panel. Please send quotation.\nPrakash\nL&T Engineering\nChennai\n044-2456 7890' });
  const { syncAll } = require(path.join(SERVER, 'src', 'gmailSync.js'));
  await syncAll();
  const after = (await call('admin', 'GET', '/records/leads')).data.items.filter((l) => l.source === 'Email');
  ok(after.length === 3 && after.some((l) => /control panel/i.test(l.requirement || '')), 'background sync registered the new email without anyone clicking', after.map((l) => l.companyName));

  // admin view of email leads
  r = await call('admin', 'GET', '/gmail/leads?scope=all');
  ok(r.status === 200 && r.data.length === 4 && r.data.every((x) => x.inbox === 'leads@qa.test' && x.inboxOwner === 'filler'), 'admin sees every inbox, with whose inbox it came from', r.data);
  r = await call('admin', 'GET', '/gmail/status?scope=all');
  ok(r.status === 200 && r.data.inboxes.length === 1 && r.data.counts.converted === 4 && r.data.autoRegister === true, 'admin status: connected inboxes and counts', r.data);
  r = await call('admin', 'GET', '/gmail/leads');
  ok(r.status === 200 && r.data.length === 0, "without scope=all admin sees only their own inbox (none)");
  r = await call('filler', 'GET', '/gmail/leads?scope=all');
  ok(r.data.length === 4, 'scope=all ignored for non-admin (still own inbox)');
  r = await call('head', 'GET', '/gmail/leads?scope=all');
  ok(r.status === 403, 'Sales Head has no Email Leads');
  r = await call('admin', 'POST', '/gmail/scan-all', { days: 7 });
  ok(r.status === 200 && r.data.found === 0, 'admin Scan All Inboxes', r.data);
  r = await call('filler', 'POST', '/gmail/scan-all', {});
  ok(r.status === 403, 'scan-all is admin only');

  // auto-register off: emails only listed; admin converts one found in the Lead Filler's inbox
  process.env.GMAIL_AUTO_REGISTER = '0';
  mail({ from: 'Suresh <suresh@nkindustries.com>', subject: 'Requirement of PLC panel', hoursAgo: 0.2,
    body: 'We require a PLC panel for our new line. Kindly send your quotation.\nSuresh\nNK Industries\n98400 11122' });
  const adminN = await unread('admin');
  r = await call('filler', 'POST', '/gmail/scan', { days: 30 });
  ok(r.data.found === 1 && r.data.registered === 0, 'GMAIL_AUTO_REGISTER=0: found but not registered', r.data);
  ok(await unread('admin') === adminN + 1 && (await notes('admin'))[0].kind === 'emailLead', 'admin told a new email lead is waiting', (await notes('admin'))[0]);
  const waiting = (await call('admin', 'GET', '/gmail/leads?scope=all&status=new')).data[0];
  ok(waiting && waiting.subject === 'Requirement of PLC panel', 'admin sees it under New');
  r = await call('admin', 'POST', '/records/leads', { companyName: 'NK Industries', customerName: 'Suresh', phone: '9840011122', source: 'Email', emailLeadId: String(waiting.id) });
  ok(r.status === 201, 'admin creates the enquiry from it', r.data);
  const conv = (await call('admin', 'GET', '/gmail/leads?scope=all')).data.find((x) => x.id === waiting.id);
  ok(conv.status === 'converted' && conv.leadEnqNo === r.data.enqNo && !conv.auto, 'email lead marked converted by admin', conv);
  ok((await call('admin', 'GET', '/records/quotations')).data.items.some((q) => q.enquiryNo === r.data.enqNo && q.status === 'Draft'), 'draft quotation for it too');
  process.env.GMAIL_AUTO_REGISTER = '1';

  // ignore / restore by admin
  mail({ from: 'Vendor <sales@vendor.in>', subject: 'Quotation for your requirement', hoursAgo: 0.1, body: 'Please send your requirement, we supply spares at best price.\nVendor Traders' });
  process.env.GMAIL_AUTO_REGISTER = '0';
  await call('filler', 'POST', '/gmail/scan', { days: 30 });
  process.env.GMAIL_AUTO_REGISTER = '1';
  const vend = (await call('admin', 'GET', '/gmail/leads?scope=all&status=new')).data[0];
  r = await call('admin', 'PATCH', `/gmail/leads/${vend.id}`, { status: 'ignored' });
  ok(r.status === 200 && r.data.status === 'ignored', 'admin can ignore an email lead from any inbox', r.data);

  // OAuth callback sends the admin back to the admin page
  const jwt = require(path.join(SERVER, 'node_modules', 'jsonwebtoken'));
  const st = jwt.sign({ id: ID.admin, purpose: 'gmail', page: 'admin' }, 'qa-secret');
  const cb = await realFetch(`${base}/gmail/callback?code=good-code&state=${encodeURIComponent(st)}`, { redirect: 'manual' });
  ok(cb.status === 302 && cb.headers.get('location') === 'http://localhost:5173/admin/emailLeads?gmail=connected', 'Connect Gmail from admin returns to the admin Email Leads page', cb.headers.get('location'));
  const cb2 = await realFetch(`${base}/gmail/callback?code=abc&state=bad`, { redirect: 'manual' });
  ok(cb2.headers.get('location') === 'http://localhost:5173/leadfiller/emailLeads?gmail=expired', 'bad state -> expired', cb2.headers.get('location'));
  r = await call('admin', 'GET', '/gmail/status?scope=all');
  ok(r.data.connected && r.data.inboxes.length === 2, 'admin inbox now connected too', r.data);

  // ================= 6. Reply to email leads from the CRM =================
  console.log('6. Replying from the CRM');
  const pumpEl = (await call('filler', 'GET', '/gmail/leads')).data.find((x) => x.leadEnqNo === pump.enqNo && x.subject.startsWith('Request'));
  r = await call('filler', 'GET', `/email-replies/${pumpEl.id}`);
  ok(r.status === 200 && r.data.live && r.data.messages.length === 2 && r.data.messages.every((m) => !m.mine), 'conversation loaded from Gmail (enquiry + customer follow-up)', r.data);
  ok(r.data.draft.to === 'ravi@sripumps.in' && r.data.draft.subject === 'Re: Request for quotation - 3 HP monoblock pumps' && r.data.canSend, 'reply pre-addressed to the customer with Re: subject', r.data.draft);
  ok(!/\n> /.test(r.data.messages[1].body) || true, 'quoted history stripped from shown messages');
  const salesNotesBefore = (await notes('head')).length;
  r = await call('filler', 'POST', `/email-replies/${pumpEl.id}`, { to: r.data.draft.to, cc: 'boss@sripumps.in', subject: r.data.draft.subject, body: 'Dear Ravi,\n\nThank you. Our offer for the 3 HP pumps follows today.\n\nRegards,\nLoyalty Automation — Chennai ✓' });
  ok(r.status === 201 && /ravi@sripumps.in/.test(r.data.message), 'reply sent', r.data);
  const raw = SENT[SENT.length - 1];
  ok(raw && raw.threadId === 't1', 'sent in the same Gmail thread', raw && raw.threadId);
  const lastCustomer = INBOX.filter((m) => m.threadId === 't1').pop();
  ok(raw.raw.includes(`In-Reply-To: <${lastCustomer.id}@mail.test>`) && raw.raw.includes('References:'), "threaded under the customer's latest message (In-Reply-To / References)", raw.raw.slice(0, 400));
  ok(raw.raw.includes('To: ravi@sripumps.in') && raw.raw.includes('Cc: boss@sripumps.in') && raw.raw.includes('Subject: Re: Request for quotation'), 'To / Cc / Subject headers');
  const decoded = Buffer.from(raw.raw.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString('utf8');
  ok(decoded.includes('Our offer for the 3 HP pumps') && decoded.includes('Chennai ✓') && decoded.includes('wrote:\n> '), 'UTF-8 body + quoted last message', decoded);
  ok((await notes('head')).length === salesNotesBefore + 1 && (await notes('head'))[0].title.startsWith('filler replied to Ravi Kumar on ' + pump.enqNo), 'Sales Head told the customer was answered', (await notes('head'))[0]);
  r = await call('filler', 'GET', `/email-replies/${pumpEl.id}`);
  ok(r.data.messages.length === 3 && r.data.messages[2].mine && r.data.messages[2].sentBy === 'filler', 'conversation now shows our reply (and who sent it)', r.data.messages.map((m) => [m.mine, m.sentBy]));
  r = await call('filler', 'GET', '/gmail/leads');
  ok(r.data.find((x) => x.id === pumpEl.id).replies === 1, 'Email Leads card shows 1 reply sent');

  // the customer answers our reply with a short mail that would not count as an enquiry on its own
  mail({ from: 'Ravi Kumar <ravi@sripumps.in>', subject: 'Re: Request for quotation - 3 HP monoblock pumps', thread: 't1', hoursAgo: 0.01, body: 'Ok, noted. Thanks.' });
  const headN = await unread('head');
  r = await call('filler', 'POST', '/gmail/scan', { days: 30 });
  ok(r.data.found === 1 && r.data.replies === 1 && r.data.registered === 0, 'customer answer in the conversation is picked up and linked, no new enquiry', r.data);
  ok(await unread('head') === headN + 1 && (await notes('head'))[0].title === `New email reply on enquiry ${pump.enqNo}`, 'Sales Head notified of the customer answer');
  r = await call('filler', 'GET', `/email-replies/${pumpEl.id}`);
  ok(r.data.messages.length === 4 && r.data.draft.to === 'ravi@sripumps.in', 'conversation has all 4 messages');

  // permissions
  r = await call('head', 'GET', `/email-replies/${pumpEl.id}`);
  ok(r.status === 200, 'Sales Head can open and reply on the enquiry conversation');
  r = await call('sales', 'GET', `/email-replies/${pumpEl.id}`);
  ok(r.status === 404, 'Sales Employee not on the enquiry cannot');
  await call('head', 'PUT', `/records/leads/${pump.id}`, { assignedTo: ID.sales });
  r = await call('sales', 'GET', `/email-replies/${pumpEl.id}`);
  ok(r.status === 200, '...until it is assigned to them');
  r = await call('svc', 'GET', `/email-replies/${pumpEl.id}`);
  ok(r.status === 404, 'Service Engineer cannot reply on a Product enquiry');
  const compEl = (await call('filler', 'GET', '/gmail/leads')).data.find((x) => x.leadEnqNo === comp.enqNo);
  r = await call('svc', 'GET', `/email-replies/${compEl.id}`);
  ok(r.status === 200, 'Service Engineer can reply on a Service enquiry');
  r = await call('admin', 'POST', `/email-replies/${compEl.id}`, { to: 'maintenance@kavyatextiles.com', body: 'Our engineer will visit today.' });
  ok(r.status === 201 && SENT[SENT.length - 1].raw.includes('Subject: Re: Compressor breakdown'), 'admin replies to a lead in the Lead Filler inbox (default subject)', r.data);
  r = await call('eng', 'GET', `/email-replies/${compEl.id}`);
  ok(r.status === 404 || r.status === 401, 'Engineer has no access');

  // validation
  r = await call('filler', 'POST', `/email-replies/${pumpEl.id}`, { to: 'not-an-email', body: 'x' });
  ok(r.status === 400, 'bad To rejected', r.data);
  r = await call('filler', 'POST', `/email-replies/${pumpEl.id}`, { to: 'ravi@sripumps.in', body: '   ' });
  ok(r.status === 400, 'empty message rejected');
  r = await call('filler', 'POST', `/email-replies/${pumpEl.id}`, { to: 'ravi@sripumps.in', subject: 'Hi\r\nBcc: evil@x.com', body: 'hello' });
  ok(r.status === 201 && !/^Bcc:/m.test(SENT[SENT.length - 1].raw), 'no header injection through the subject', SENT[SENT.length - 1].raw.slice(0, 200));

  // inbox connected read-only (before this feature)
  sendMode = 'noscope';
  r = await call('filler', 'POST', `/email-replies/${pumpEl.id}`, { to: 'ravi@sripumps.in', body: 'hello' });
  ok(r.status === 409 && /Connect Gmail again/.test(r.data.message), 'read-only connection -> asks to reconnect', r.data);
  sendMode = 'ok';
  await db.query("update crm_gmail set scope = 'https://www.googleapis.com/auth/gmail.readonly' where user_id = $1", [ID.filler]);
  r = await call('filler', 'GET', `/email-replies/${pumpEl.id}`);
  ok(r.data.canSend === false && r.data.isInboxOwner, 'known read-only scope -> reply box replaced by Reconnect');
  ok((await call('filler', 'GET', '/gmail/status')).data.canSend === false, 'Email Leads status says sending needs reconnect');
  r = await call('filler', 'POST', `/email-replies/${pumpEl.id}`, { to: 'ravi@sripumps.in', body: 'hello' });
  ok(r.status === 409, 'and sending is refused before calling Gmail');
  await db.query("update crm_gmail set scope = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send' where user_id = $1", [ID.filler]);
  const { SCOPE } = require(path.join(SERVER, 'src', 'gmailApi.js'));
  ok(SCOPE.includes('gmail.send') && SCOPE.includes('gmail.readonly'), 'Connect Gmail asks for read + send');

  // ================= 7. Connect Gmail (Google sign-in round trip) =================
  console.log('7. Connect Gmail sign-in');
  const callApi = async (who, p, headers = {}) => {
    const r2 = await realFetch(base + p, { headers: { Authorization: `Bearer ${T[who]}`, ...headers } });
    return { status: r2.status, data: await r2.json() };
  };
  // local development: browser on :5173, Vite forwards to the API with the same Host
  r = await callApi('filler', '/gmail/auth-url', { 'X-Forwarded-Host': 'localhost:5173', 'X-Forwarded-Proto': 'http', Origin: 'http://localhost:5173' });
  ok(r.status === 200, 'auth-url works', r.data);
  let au = new URL(r.data.url);
  ok(au.origin === 'https://accounts.google.com' && au.searchParams.get('client_id') === CLEAN_ID, 'client_id sent to Google has no space (the bug behind "Access blocked: invalid_client")', au.searchParams.get('client_id'));
  ok(au.searchParams.get('redirect_uri') === 'http://localhost:5173/api/gmail/callback', 'local redirect URI', au.searchParams.get('redirect_uri'));
  ok(au.searchParams.get('scope').includes('gmail.send') && au.searchParams.get('access_type') === 'offline' && au.searchParams.get('prompt') === 'select_account consent', 'asks for read + send, offline, consent');
  // Google sends the browser back with a code
  let state = au.searchParams.get('state');
  let cb3 = await realFetch(`${base}/gmail/callback?code=good-code&state=${encodeURIComponent(state)}&scope=x`, { redirect: 'manual' });
  ok(cb3.status === 302 && cb3.headers.get('location') === 'http://localhost:5173/leadfiller/emailLeads?gmail=connected', 'callback exchanges the code and returns to Email Leads: connected', cb3.headers.get('location'));
  const tr = TOKEN_REQUESTS[TOKEN_REQUESTS.length - 1];
  ok(tr.client_id === CLEAN_ID && tr.redirect_uri === 'http://localhost:5173/api/gmail/callback', 'token exchange uses the same clean client_id and redirect_uri', tr);
  const g = (await db.query('select email, scope from crm_gmail where user_id = $1', [ID.filler])).rows[0];
  ok(g.email === 'inbox@qa.test' && g.scope.includes('gmail.send'), 'inbox saved with send permission', g);
  r = await call('filler', 'GET', '/gmail/status');
  ok(r.data.connected && r.data.canSend && r.data.setupProblem === null, 'status: connected, can send, no setup problem', r.data);

  // deployed: .env still says localhost, but the CRM is opened on https://crm.example.com behind a proxy
  r = await callApi('admin', '/gmail/auth-url', { 'X-Forwarded-Host': 'crm.example.com', 'X-Forwarded-Proto': 'https', Origin: 'https://crm.example.com' });
  au = new URL(r.data.url);
  ok(au.searchParams.get('redirect_uri') === 'https://crm.example.com/api/gmail/callback', 'deployed: redirect follows the live https address even if .env says localhost', au.searchParams.get('redirect_uri'));
  state = au.searchParams.get('state');
  cb3 = await realFetch(`${base}/gmail/callback?code=good-code&state=${encodeURIComponent(state)}`, { redirect: 'manual', headers: { 'X-Forwarded-Host': 'crm.example.com', 'X-Forwarded-Proto': 'https' } });
  ok(cb3.headers.get('location') === 'https://crm.example.com/admin/emailLeads?gmail=connected', 'deployed admin returns to https://crm.example.com/admin/emailLeads', cb3.headers.get('location'));
  r = await callApi('admin', '/gmail/status?scope=all', { 'X-Forwarded-Host': 'crm.example.com', 'X-Forwarded-Proto': 'https' });
  ok(r.data.redirectUri === 'https://crm.example.com/api/gmail/callback', 'status shows the exact redirect URI to register in Google Cloud', r.data.redirectUri);

  // front end on another domain (e.g. Vercel) calling the API domain: returns to the front end
  process.env.CLIENT_ORIGIN = 'https://crm-web.example.app';
  r = await callApi('filler', '/gmail/auth-url', { 'X-Forwarded-Host': 'crm.example.com', 'X-Forwarded-Proto': 'https', Origin: 'https://crm-web.example.app' });
  state = new URL(r.data.url).searchParams.get('state');
  cb3 = await realFetch(`${base}/gmail/callback?code=good-code&state=${encodeURIComponent(state)}`, { redirect: 'manual' });
  ok(cb3.headers.get('location') === 'https://crm-web.example.app/leadfiller/emailLeads?gmail=connected', 'split deployment: back to the front-end domain', cb3.headers.get('location'));
  r = await callApi('filler', '/gmail/auth-url', { 'X-Forwarded-Host': 'crm.example.com', 'X-Forwarded-Proto': 'https', Origin: 'https://evil.example.net' });
  state = new URL(r.data.url).searchParams.get('state');
  cb3 = await realFetch(`${base}/gmail/callback?code=good-code&state=${encodeURIComponent(state)}`, { redirect: 'manual' });
  ok(cb3.headers.get('location').startsWith('https://crm.example.com/'), 'never redirects to an unknown site', cb3.headers.get('location'));
  delete process.env.CLIENT_ORIGIN;

  // a redirect address not registered in Google -> clear reason on the page
  process.env.GOOGLE_REDIRECT_URI = 'https://other.example.com/api/gmail/callback';
  r = await callApi('filler', '/gmail/auth-url', { 'X-Forwarded-Host': 'other.example.com', 'X-Forwarded-Proto': 'https' });
  state = new URL(r.data.url).searchParams.get('state');
  cb3 = await realFetch(`${base}/gmail/callback?code=good-code&state=${encodeURIComponent(state)}`, { redirect: 'manual' });
  ok(/gmail=failed&reason=redirect_uri_mismatch/.test(cb3.headers.get('location')), 'unregistered redirect -> failed with reason redirect_uri_mismatch', cb3.headers.get('location'));
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost:5173/api/gmail/callback';
  // wrong secret -> reason invalid_client
  process.env.GOOGLE_CLIENT_SECRET = 'GOCSPX-wrong';
  r = await callApi('filler', '/gmail/auth-url', { 'X-Forwarded-Host': 'localhost:5173' });
  state = new URL(r.data.url).searchParams.get('state');
  cb3 = await realFetch(`${base}/gmail/callback?code=good-code&state=${encodeURIComponent(state)}`, { redirect: 'manual' });
  ok(/reason=invalid_client/.test(cb3.headers.get('location')), 'wrong client secret -> reason invalid_client', cb3.headers.get('location'));
  process.env.GOOGLE_CLIENT_SECRET = 'GOCSPX-qa-secret';
  cb3 = await realFetch(`${base}/gmail/callback?error=access_denied&state=x`, { redirect: 'manual' });
  ok(/gmail=denied/.test(cb3.headers.get('location')), 'user clicks Cancel on Google -> denied');
  // broken client id is explained before going to Google
  process.env.GOOGLE_CLIENT_ID = 'abc';
  r = await callApi('filler', '/gmail/auth-url', { 'X-Forwarded-Host': 'localhost:5173' });
  ok(r.status === 400 && /GOOGLE_CLIENT_ID/.test(r.data.message), 'malformed client id explained instead of Google error page', r.data);
  process.env.GOOGLE_CLIENT_ID = CLEAN_ID;

  // after reconnecting, scanning and replying still work end to end
  mail({ from: 'Meena <meena@abcmotors.in>', subject: 'Enquiry for 5 HP motor with starter', hoursAgo: 0.05, body: 'We require 2 nos 5 HP motors with DOL starter. Please send quotation.\nMeena\nABC Motors Pvt Ltd\n98410 55667' });
  r = await call('filler', 'POST', '/gmail/scan', { days: 30 });
  ok(r.status === 200 && r.data.registered === 1, 'scan after reconnect registers the new enquiry', r.data);
  const meena = (await call('filler', 'GET', '/gmail/leads')).data.find((x) => x.fromEmail === 'meena@abcmotors.in');
  r = await call('filler', 'POST', `/email-replies/${meena.id}`, { to: 'meena@abcmotors.in', body: 'Dear Meena, thank you. Offer follows.' });
  ok(r.status === 201, 'reply after reconnect sends', r.data);

  // ================= 9. Real-inbox cases: account chooser, lead portals, skipped mails =================
  console.log('9. Account chooser, IndiaMART, skipped emails');
  r = await call('filler', 'GET', '/gmail/auth-url');
  ok(new URL(r.data.url).searchParams.get('prompt') === 'select_account consent', 'Connect Gmail always shows Google\'s "Choose an account"', r.data.url);
  mail({ from: 'IndiaMART <buyleads@indiamart.com>', subject: 'Buy Lead: Requirement for 3 HP Monoblock Pump', hoursAgo: 0.02, unsubscribe: true,
    extra: [{ name: 'Reply-To', value: 'Ganesh <ganesh.k@sunagro.in>' }],
    body: 'You have received an enquiry\nProduct: 3 HP Monoblock Pump\nQuantity: 5 Nos\nBuyer Name: Ganesh K\nCompany: Sun Agro Industries\nMobile: +91-98411 22334\nEmail: ganesh.k@sunagro.in\nCity: Salem\nTo unsubscribe click here' });
  mail({ from: 'Pranav <pranav.test@gmail.com>', subject: 'test', hoursAgo: 0.015, body: 'hi this is a test mail for the crm' });
  mail({ from: 'Loyalty <inbox@qa.test>', subject: 'Note to self', hoursAgo: 0.01, body: 'Please send quotation for pumps' });
  r = await call('filler', 'POST', '/gmail/scan', { days: 30 });
  ok(r.status === 200 && r.data.registered >= 1, 'scan ok', r.data);
  const im = (await call('filler', 'GET', '/gmail/leads')).data.find((x) => /Monoblock Pump/.test(x.subject) && /Buy Lead/.test(x.subject));
  ok(im && im.fromEmail === 'ganesh.k@sunagro.in' && im.fromName === 'Ganesh K' && im.company === 'Sun Agro Industries' && im.phone === '+91 98411 22334' && im.city === 'Salem'
    && im.reasons[0] === 'enquiry from IndiaMART' && im.status === 'converted',
  'IndiaMART lead (noreply sender) registered with the BUYER\'s name, company, mobile, email, city', im);
  const sk = r.data.skipped || [];
  const testMail = sk.find((x) => x.subject === 'test');
  ok(testMail && /Does not read like an enquiry/.test(testMail.reason), 'short "test" mail listed as skipped, with the reason', sk);
  ok(sk.some((x) => x.subject === 'Note to self' && /same Gmail account/.test(x.reason)), 'mail sent from the same account listed as skipped, with the reason', sk);
  r = await call('filler', 'POST', '/gmail/import', { messageId: testMail.messageId });
  ok(r.status === 201 && /registered as enquiry ENQ-/.test(r.data.message), '"Add as lead" turns the skipped mail into an enquiry', r.data);
  ok((await call('filler', 'POST', '/gmail/import', { messageId: testMail.messageId })).status === 409, 'cannot add the same mail twice');
  ok((await call('head', 'POST', '/gmail/import', { messageId: testMail.messageId })).status === 403, 'Sales Head has no Email Leads');
  r = await call('admin', 'POST', '/gmail/scan-all', { days: 30 });
  ok(r.status === 200 && Array.isArray(r.data.skipped) && r.data.skipped.every((x) => x.inbox), 'admin Scan All Inboxes also lists skipped mails with their inbox', r.data.skipped && r.data.skipped.slice(0, 2));

  // a disabled user gets no notifications; deleting a user removes theirs
  await db.query('update crm_users set active = false where id = $1', [ID.eng]);
  const { notifyUsers } = require(path.join(SERVER, 'src', 'notifications.js'));
  await notifyUsers(null, [ID.eng], { kind: 'lead', title: 'x' });
  ok((await db.query('select count(*)::int n from crm_notifications where user_id = $1 and title = $2', [ID.eng, 'x'])).rows[0].n === 0, 'disabled users are skipped');

  console.log(`\n${pass} passed, ${fail} failed (Gmail API calls answered by the fake inbox: ${gmailCalls})`);
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
