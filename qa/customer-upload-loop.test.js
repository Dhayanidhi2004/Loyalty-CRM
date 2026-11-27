// Customer upload loop:  cd qa && node customer-upload-loop.test.js [rounds=1000] [result.json]
// Repeats the customer-upload flow N times against ONE running app + in-memory Postgres:
// upload files -> read customers (PDF / Excel / CSV / JSON / TSV, + OCR files every 25th round) -> save -> save again (must be duplicates)
// plus access checks. Writes progress to a JSON file.
const path = require('path'), fs = require('fs'), Module = require('module');
const ROOT = path.join(__dirname, '..'), N = Number(process.argv[2]) || 1000, OUT = process.argv[3] || path.join(require('os').tmpdir(), 'customer-upload-loop.json');
const SERVER = path.join(ROOT, 'server');
process.env.DATABASE_URL = 'postgres://qa:qa@localhost:5432/qa'; process.env.JWT_SECRET = 'qa-secret';
let checks = 0, failures = [];
const ok = (c, m, extra) => { checks++; if (!c && failures.length < 50) failures.push(`${m} ${extra !== undefined ? JSON.stringify(extra).slice(0, 200) : ''}`); if (!c) failures.count = (failures.count || 0) + 1; };
(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const toNum = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])));
  const run = async (t, p) => { const r = await db.query(t, p); return { rows: toNum(r.rows), rowCount: r.affectedRows ?? r.rows.length }; };
  class Pool { query(t, p) { return run(t, p); } async connect() { return { query: (t, p) => run(t, p), release() {} }; } on() {} }
  const orig = Module._load; Module._load = function (r, ...x) { return r === 'pg' ? { Pool, types: { setTypeParser() {} } } : orig.call(this, r, ...x); };
  await db.exec(fs.readFileSync(path.join(SERVER, 'supabase/schema.sql'), 'utf8'));
  const { startSession } = require(path.join(SERVER, 'src/auth.js'));
  const tok = {};
  for (const [k, d, role] of [['admin', 'Admin', 'admin'], ['head', 'Sales Head', 'employee'], ['sales', 'Sales Employee', 'employee'], ['inv', 'Inventory Manager', 'employee']]) {
    const r = await db.query('insert into crm_users (name,email,password_hash,role,designation) values ($1,$2,$3,$4,$5) returning id', [k, `${k}@t.io`, 'x', role, d]);
    tok[k] = await startSession({ id: Number(r.rows[0].id), role }, `qa-${k}`);
  }
  const app = require(path.join(SERVER, 'src/app.js'));
  const srv = await new Promise((o) => { const s = app.listen(0, '127.0.0.1', () => o(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  const call = async (who, method, url, body, form) => {
    const res = await fetch(base + url, { method, headers: { ...(who ? { Authorization: `Bearer ${tok[who]}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: form || (body ? JSON.stringify(body) : undefined) });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  const FIX = path.join(ROOT, 'qa/fixtures/uploads');
  const all = fs.readdirSync(FIX).filter((f) => !/^stock/.test(f));
  const OCR = (f) => /Scanned|Visiting_Card/.test(f);
  const fast = all.filter((f) => !OCR(f)), slow = all.filter(OCR);
  const buf = Object.fromEntries(all.map((f) => [f, fs.readFileSync(path.join(FIX, f))]));
  let uploads = 0, saved = 0, t0 = Date.now(), ocrRounds = 0;
  for (let i = 1; i <= N; i++) {
    const useOcr = i % 25 === 0; if (useOcr) ocrRounds++;
    const files = useOcr ? all : fast;
    const form = new FormData(); files.forEach((f) => form.append('files', new Blob([buf[f]]), f)); uploads += files.length;
    const r = await call(['head', 'admin', 'sales'][i % 3], 'POST', '/customer-extract', undefined, form);
    ok(r.status === 200 && r.data?.results?.length === files.length, `round ${i}: extract status`, r.status);
    const res = Object.fromEntries((r.data?.results || []).map((x) => [x.file, x]));
    const first = (f) => res[f]?.customers?.[0] || {};
    ok(first('1104_Madras Engineering Industries Pvt Ltd - MM Nagar.pdf').companyName === 'Madras Engineering Industries Pvt Ltd', `round ${i}: quotation PDF company`);
    ok(first('1104_Madras Engineering Industries Pvt Ltd - MM Nagar.pdf').gst === '33AAACM5678K1Z2', `round ${i}: quotation PDF GST`);
    ok(first('GST_Certificate_Kaveri.pdf').gst === '33AABFK7788M1ZQ' && /Ambattur/.test(first('GST_Certificate_Kaveri.pdf').address || ''), `round ${i}: GST certificate`);
    ok(res['Customer_List.pdf']?.customers?.length === 3, `round ${i}: PDF with 3 customers`);
    ok(first('PO_Sri_Vinayaga_Textiles.pdf').gst === '33AAICS4455R1ZK', `round ${i}: customer PO`);
    for (const f of ['1108_AVO Carbon India Private Limited - Chennai.pdf', 'Invoice_1108.pdf']) ok(first(f).companyName === 'AVO Carbon India Private Limited' && !/loyalty|bill to/i.test(JSON.stringify(first(f))), `round ${i}: ${f}`);
    ok(res['customers.xlsx']?.customers?.length === 3 && res['customers.csv']?.customers?.length === 1 && res['customers.json']?.customers?.length === 1 && res['customers.tsv']?.customers?.length === 1, `round ${i}: Excel/CSV/JSON/TSV`);
    ok(Object.values(res).every((x) => !x.notes.some((n) => /Could not read|not defined|Cannot find|Unsupported/.test(n))), `round ${i}: no read errors`, Object.values(res).map((x) => x.notes).flat());
    if (useOcr) for (const f of slow) ok(first(f).companyName === (/AVO/.test(f) ? 'AVO Carbon India Private Limited' : 'ROYAL HYDRAULICS PVT LTD'), `round ${i}: OCR ${f}`, first(f));
    // save exactly what the screen would send, made unique per round
    const rows = [...res['Customer_List.pdf'].customers, ...res['customers.csv'].customers, ...res['customers.json'].customers].map((c) => ({ ...c, companyName: `${c.companyName} R${i}`, gst: '', pan: '', email: c.email && /^\S+@\S+\.\S+$/.test(c.email) ? c.email : '' }));
    const s1 = await call('head', 'POST', '/records/customers/bulk', { customers: rows });
    ok(s1.status === 201 && s1.data.added === rows.length && s1.data.invalidCount === 0, `round ${i}: save`, s1.data);
    saved += s1.data?.added || 0;
    const s2 = await call('head', 'POST', '/records/customers/bulk', { customers: rows });
    ok(s2.status === 201 && s2.data.added === 0 && s2.data.duplicates === rows.length, `round ${i}: re-save is all duplicates`, s2.data);
    ok((await call('inv', 'POST', '/customer-extract', undefined, form)).status === 403, `round ${i}: read-only role blocked`);
    ok((await call(null, 'POST', '/customer-extract', undefined, form)).status === 401, `round ${i}: login required`);
    if (i % 50 === 0) fs.writeFileSync(OUT, JSON.stringify({ done: i, of: N, checks, failures: failures.count || 0, firstFailures: failures, uploads, saved, ocrRounds, seconds: (Date.now() - t0) / 1000 }));
  }
  const list = (await call('admin', 'GET', '/records/customers?limit=2000')).data;
  const total = (await db.query("select count(*)::int n from crm_records where module='customers'")).rows[0].n;
  const ids = (await db.query("select data->>'cusId' id from crm_records where module='customers'")).rows.map((r) => r.id);
  ok(total === saved, 'final: every saved customer is in the database exactly once', { total, saved });
  ok(new Set(ids).size === ids.length && ids.every((x) => /^CUS-\d{6}$/.test(x)), 'final: all Cus IDs unique and well-formed');
  fs.writeFileSync(OUT, JSON.stringify({ done: N, of: N, finished: true, checks, failures: failures.count || 0, firstFailures: failures, uploads, saved, ocrRounds, customersInDb: total, seconds: (Date.now() - t0) / 1000 }));
  srv.close(); process.exit(0);
})().catch((e) => { fs.writeFileSync(OUT, JSON.stringify({ crashed: String(e.stack || e) })); process.exit(2); });
