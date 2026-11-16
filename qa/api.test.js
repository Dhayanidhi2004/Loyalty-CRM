// API test: real Express router + real Postgres (PGlite). Randomised, model-checked.
// Usage: node api.test.js [N]     (N = number of randomised operations, default 12000)
const { start } = require('./harness');
const N = Number(process.argv[2]) || 12000;

// ---- deterministic PRNG so a failure can be replayed ----
let seed = Number(process.env.SEED) || 20261013;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const chance = (p) => rnd() < p;

let total = 0; const fails = []; const byGroup = {};
function check(group, cond, msg) {
  total++; byGroup[group] = (byGroup[group] || 0) + 1;
  if (!cond && fails.length < 40) fails.push(`[${group}] ${msg}`);
  if (!cond) byGroup[`${group}:FAIL`] = (byGroup[`${group}:FAIL`] || 0) + 1;
}

// ---- reference spec of what the API must store (written from the requirements, not copied) ----
const TEXT = ['ref', 'date', 'cust', 'proj', 'delivery', 'pay', 'valid', 'warr'];
const LONG = { addr: 600, note: 600, kind: 600, bank: 800, co: 120, coAddr: 300, coContact: 300, gstin: 40, hsn: 12, uom: 20, disc: 200, bomLabel: 40, thanks: 300, support: 300 };
const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const safe = (v, max, lines) => { let s = String(v ?? '').replace(/\u0000/g, '').replace(LONE, ''); if (lines) s = s.replace(/\r/g, ''); s = s.trim(); if (s.length > max) { s = s.slice(0, max); if (/[\uD800-\uDBFF]$/.test(s)) s = s.slice(0, -1); } return s; };
const nn = (v, f = 0) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : f; };
function expected(b) {
  const d = {};
  for (const k of TEXT) d[k] = safe(b[k], 300);
  for (const [k, m] of Object.entries(LONG)) if (b[k] !== undefined) d[k] = safe(b[k], m, true);
  d.price = nn(b.price); d.gst = nn(b.gst);
  if (b.qty !== undefined) d.qty = nn(b.qty, 1);
  d.items = (Array.isArray(b.items) ? b.items : []).slice(0, 300)
    .map((i) => ({ d: safe(i?.d, 300), q: nn(i?.q), u: safe(i?.u ?? 'Nos', 20) || 'Nos', h: safe(i?.h ?? '8536', 12) }))
    .filter((i) => i.d);
  return d;
}

// ---- random request bodies, valid and nasty ----
const WORDS = ['NK Industries', 'Rambal', 'LNT', 'PLC Control Panel', 'VFD 1-HP', 'Variac', 'Chennai.', '100% Advance', 'ஆட்டோமேஷன்', '₹1,06,994', '<script>alert(1)</script>', "Robert'); DROP TABLE crm_project_quotations;--", '日本語', 'emoji 😀', '  padded  ', 'line1\nline2', 'win\r\nline', '', 'a\u0000b', 'lone\ud83d', '\ude00lone', '😀😀😀'];
const text = (max = 40) => {
  const r = rnd();
  if (r < 0.08) return null; if (r < 0.12) return undefined; if (r < 0.15) return int(0, 99999); if (r < 0.17) return [1, 2]; if (r < 0.19) return { a: 1 };
  if (r < 0.24) return 'x'.repeat(int(max - 3, max * 3));
  if (r < 0.27) return 'y'.repeat(max - 1) + '😀' + 'tail';
  return pick(WORDS) + (chance(0.3) ? ' ' + pick(WORDS) : '');
};
const numish = () => { const r = rnd(); if (r < 0.5) return int(0, 500000); if (r < 0.6) return int(0, 100000) / 100; if (r < 0.66) return String(int(0, 9999)); if (r < 0.7) return -int(1, 50); if (r < 0.74) return 'abc'; if (r < 0.77) return null; if (r < 0.8) return undefined; if (r < 0.83) return ''; if (r < 0.86) return true; if (r < 0.9) return NaN; return 18; };
const item = () => { const r = rnd(); if (r < 0.04) return null; if (r < 0.06) return 5; if (r < 0.08) return 'str'; return { d: chance(0.15) ? pick(['', '   ', null, undefined]) : text(300), q: numish(), u: chance(0.3) ? pick([undefined, null, '', 'Set', 'Nos', 'm'.repeat(30)]) : 'Nos', h: chance(0.3) ? pick([undefined, null, '', '8536', '9'.repeat(20)]) : '8536' }; };
function body({ valid = chance(0.85) } = {}) {
  const b = {};
  for (const k of TEXT) b[k] = text();
  for (const k of Object.keys(LONG)) if (chance(0.6)) b[k] = text(LONG[k]);
  if (valid) b.cust = pick(WORDS.filter((w) => w.trim())) + int(0, 999);
  else b.cust = pick(['', '   ', null, undefined]);
  b.price = numish(); b.gst = numish();
  if (chance(0.7)) b.qty = numish();
  const n = chance(0.03) ? int(250, 340) : int(0, 14);
  b.items = chance(0.03) ? pick([null, 'x', 5, {}]) : Array.from({ length: n }, item);
  return JSON.parse(JSON.stringify(b)); // what actually arrives over HTTP
}

// ---- who may do what (from server/src/roles.js: quotations level per role) ----
const WHO = {
  admin: { read: 1, write: 1, del: 1 }, saleshead: { read: 1, write: 1, del: 1 }, salesemp: { read: 1, write: 1, del: 0 },
  inventory: { read: 1, write: 0, del: 0 }, leadfiller: { read: 0, write: 0, del: 0 },
};
const ROLES = Object.keys(WHO);

(async () => {
  const h = await start(0);
  const call = async (role, method, path, b, rawToken) => {
    const headers = { 'Content-Type': 'application/json' };
    const tok = rawToken !== undefined ? rawToken : (role ? h.tokens[role] : null);
    if (tok) headers.Authorization = `Bearer ${tok}`;
    const r = await fetch(`${h.base}/api/project-quotations${path}`, { method, headers, body: b === undefined ? undefined : JSON.stringify(b) });
    let j = null; try { j = await r.json(); } catch { /* empty */ }
    return { status: r.status, j };
  };
  const pub = (q) => { const { id, updatedAt, ...rest } = q; return rest; };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const sortKeys = (o) => JSON.parse(JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v)));

  // ===== Group 1: access matrix =====
  const seedList = (await call('admin', 'GET', '')).j.items;
  check('seed', seedList.length === 4, `expected 4 seeded samples, got ${seedList.length}`);
  check('seed', ['NK Industries', 'Rambal', 'LNT'].every((n) => seedList.some((q) => q.cust.includes(n))), 'seed customers missing');
  const original = JSON.stringify(seedList.map((q) => sortKeys(pub(q))));
  for (const role of ROLES) {
    const w = WHO[role];
    const g = await call(role, 'GET', ''); check('access', g.status === (w.read ? 200 : 403), `${role} GET -> ${g.status}`);
    const p = await call(role, 'POST', '', body({ valid: true })); check('access', p.status === (w.write ? 201 : 403), `${role} POST -> ${p.status}`);
    const id = p.j?.id || seedList[0].id;
    const u = await call(role, 'PUT', `/${id}`, body({ valid: true })); check('access', u.status === (w.write ? 200 : 403), `${role} PUT -> ${u.status}`);
    const d = await call(role, 'DELETE', `/${p.j?.id || 999999}`); check('access', d.status === (w.del ? 200 : 403), `${role} DELETE -> ${d.status}`);
  }
  for (const [m, p] of [['GET', ''], ['POST', ''], ['PUT', '/1'], ['DELETE', '/1']]) {
    check('access', (await call(null, m, p, m === 'POST' || m === 'PUT' ? body() : undefined)).status === 401, `no token ${m}`);
    check('access', (await call(null, m, p, m === 'POST' || m === 'PUT' ? body() : undefined, 'garbage.token.value')).status === 401, `bad token ${m}`);
  }
  for (const bad of ['abc', '1.5', '-1', '1;drop', '%20', '0x10', '1e3']) {
    check('access', (await call('admin', 'PUT', `/${bad}`, body({ valid: true }))).status === 404, `PUT /${bad}`);
    check('access', (await call('admin', 'DELETE', `/${bad}`)).status === 404, `DELETE /${bad}`);
  }
  check('access', (await call('admin', 'PUT', '/99999999', body({ valid: true }))).status === 404, 'PUT unknown id -> 404');
  check('access', (await call('admin', 'POST', '', {})).status === 400, 'POST {} -> 400 customer required');
  check('access', (await call('admin', 'POST', '', { cust: '   ' })).status === 400, 'POST blank cust -> 400');

  for (const [name, raw] of [['emoji split at limit', JSON.stringify({ cust: 'a', proj: 'x'.repeat(299) + '😀', addr: 'y'.repeat(599) + '😀', items: [{ d: 'z'.repeat(299) + '😀' }] })], ['NUL char', JSON.stringify({ cust: 'a\u0000b' })], ['lone surrogate', '{"cust":"a\\ud83d","note":"\\ude00"}']]) {
    const r = await fetch(`${h.base}/api/project-quotations`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${h.tokens.admin}` }, body: raw });
    check('regression', r.status === 201, `${name} -> ${r.status} (was a 500)`);
  }

  // ===== Group 2: randomised lifecycle, checked against a model =====
  const model = new Map(); // id -> expected data
  for (const q of (await call('admin', 'GET', '')).j.items) model.set(q.id, sortKeys(pub(q)));
  const ids = () => [...model.keys()];
  const fullCompare = async (tag) => {
    const l = (await call('saleshead', 'GET', '')).j.items;
    check('model', l.length === model.size, `${tag}: count ${l.length} vs model ${model.size}`);
    check('model', l.every((q, i, a) => i === 0 || a[i - 1].id < q.id), `${tag}: list not ordered by id`);
    for (const q of l) check('model', same(sortKeys(pub(q)), model.get(q.id)), `${tag}: record ${q.id} differs from model`);
  };
  await fullCompare('start');
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const role = pick(ROLES); const w = WHO[role];
    const op = pick(['post', 'post', 'put', 'put', 'put', 'get', 'del', 'dup', 'post-bad', 'put-bad']);
    if (op === 'get') {
      const r = await call(role, 'GET', ''); check('lifecycle', r.status === (w.read ? 200 : 403), `GET ${role} ${r.status}`);
    } else if (op === 'post' || op === 'post-bad') {
      const b = body({ valid: op === 'post' }); const r = await call(role, 'POST', '', b);
      if (!w.write) { check('lifecycle', r.status === 403, `POST ${role} should be 403 got ${r.status}`); continue; }
      const e = expected(b);
      if (!e.cust) { check('lifecycle', r.status === 400, `POST blank cust should be 400 got ${r.status}`); continue; }
      check('lifecycle', r.status === 201, `POST should be 201 got ${r.status} ${JSON.stringify(r.j).slice(0, 120)}`);
      if (r.status === 201) { check('lifecycle', same(sortKeys(pub(r.j)), sortKeys(e)), `POST body mismatch id ${r.j.id}`); model.set(r.j.id, sortKeys(e)); }
    } else if (op === 'dup') {
      if (!ids().length) continue;
      const src = model.get(pick(ids())); const b = { ...JSON.parse(JSON.stringify(src)), ref: '' };
      const r = await call(role, 'POST', '', b);
      if (!w.write) { check('lifecycle', r.status === 403, 'dup 403'); continue; }
      const e = expected(b);
      check('lifecycle', r.status === 201 && same(sortKeys(pub(r.j)), sortKeys(e)), `duplicate not idempotent over stored data (status ${r.status})`);
      if (r.status === 201) model.set(r.j.id, sortKeys(e));
    } else if (op === 'put' || op === 'put-bad') {
      if (!ids().length) continue;
      const id = pick(ids()); const b = body({ valid: op === 'put' }); const r = await call(role, 'PUT', `/${id}`, b);
      if (!w.write) { check('lifecycle', r.status === 403, `PUT ${role} should be 403 got ${r.status}`); continue; }
      const e = expected(b);
      if (!e.cust) { check('lifecycle', r.status === 400, `PUT blank cust should be 400 got ${r.status}`); continue; }
      check('lifecycle', r.status === 200, `PUT should be 200 got ${r.status} ${JSON.stringify(r.j).slice(0,100)}`);
      if (r.status === 200) { check('lifecycle', r.j.id === id && same(sortKeys(pub(r.j)), sortKeys(e)), `PUT body mismatch id ${id}`); model.set(id, sortKeys(e)); }
    } else if (op === 'del') {
      if (model.size < 6) continue;
      const id = pick(ids()); const r = await call(role, 'DELETE', `/${id}`);
      if (!w.del) { check('lifecycle', r.status === 403, `DELETE ${role} should be 403 got ${r.status}`); continue; }
      check('lifecycle', r.status === 200, `DELETE should be 200 got ${r.status}`);
      if (r.status === 200) model.delete(id);
    }
    if (i % 1000 === 999) await fullCompare(`op ${i + 1}`);
  }
  await fullCompare('end of lifecycle');
  console.log(`lifecycle: ${N} randomised operations in ${((Date.now() - t0) / 1000).toFixed(1)}s, model size ${model.size}`);

  // ===== Group 3: parallel writers =====
  const par = await Promise.all(Array.from({ length: 300 }, (_, i) => call('admin', 'POST', '', { ...body({ valid: true }), cust: `PAR-${i}` })));
  check('parallel', par.every((r) => r.status === 201), 'parallel POSTs all 201');
  check('parallel', new Set(par.map((r) => r.j.id)).size === 300, 'parallel POST ids unique');
  for (const r of par) model.set(r.j.id, sortKeys(pub(r.j)));
  const parIds = par.map((r) => r.j.id);
  const par2 = await Promise.all(parIds.map((id, i) => call('saleshead', 'PUT', `/${id}`, { ...body({ valid: true }), cust: `PAR-EDIT-${i}` })));
  check('parallel', par2.every((r) => r.status === 200), 'parallel PUTs all 200');
  par2.forEach((r, i) => model.set(parIds[i], sortKeys(pub(r.j))));
  await fullCompare('after parallel');

  // ===== Group 4: round-trip of realistic edits (what the UI sends) =====
  const real = { ref: 'LAP/OFF/26-27/0999', date: '13-10-2026', cust: 'NK Industries', addr: 'Line 1\nLine 2\nChennai - 600083', proj: 'PLC Control Panel', hsn: '8537', uom: 'Nos', qty: 2.5, price: 106994.5, gst: 12, co: 'LOYALTY AUTOMATION PVT.LTD.', coAddr: 'No. 27/1\nAshok Nagar', coContact: 'Ph: 1\nMail: a@b.c', gstin: 'GST:33AACCL4592K1ZA', kind: 'Para one\n\nPara two', bomLabel: 'BILL OF MATERIALS', disc: 'Special price', delivery: '2 weeks', pay: '50% Advance', valid: '2 weeks', warr: '2 years', note: 'Urgent', bank: 'Company Name : X\nBank Name : Y\nAccount No : 1', thanks: 'Thank you', support: 'Support 24x7', items: [{ d: 'PLC', q: 1, u: 'Nos', h: '8536' }, { d: 'VFD', q: 3.5, u: 'm', h: '8504' }] };
  const created = await call('salesemp', 'POST', '', real);
  check('roundtrip', created.status === 201 && same(sortKeys(pub(created.j)), sortKeys(real)), 'realistic edit stored exactly (incl. multi-line + decimals)');
  const back = (await call('admin', 'GET', '')).j.items.find((q) => q.id === created.j.id);
  check('roundtrip', same(sortKeys(pub(back)), sortKeys(real)), 'realistic edit read back exactly');
  const legacy = await call('admin', 'PUT', `/${created.j.id}`, { cust: 'Only legacy fields', ref: 'R', price: 10, gst: 18, items: [{ d: 'x', q: 1 }] });
  check('roundtrip', legacy.status === 200 && !('qty' in legacy.j) && !('bank' in legacy.j) && legacy.j.items[0].h === '8536', 'legacy-shaped save does not invent new fields');
  model.set(created.j.id, sortKeys(pub(legacy.j)));

  // seeded originals untouched unless a test edited them
  const orig = JSON.parse(original);
  const seedIds = seedList.map((q) => q.id);
  let untouched = 0; for (let i = 0; i < seedIds.length; i++) if (model.has(seedIds[i]) && same(model.get(seedIds[i]), orig[i])) untouched++;
  console.log(`seed samples still identical to the originals: ${untouched}/4 (the rest were randomly edited/deleted by the fuzzer)`);

  console.log('\n=== API TEST REPORT ===');
  for (const [k, v] of Object.entries(byGroup)) if (!k.includes(':FAIL')) console.log(`${k.padEnd(10)} ${String(v).padStart(7)} checks   failures: ${byGroup[`${k}:FAIL`] || 0}`);
  console.log(`TOTAL      ${String(total).padStart(7)} checks   failures: ${fails.length ? Object.entries(byGroup).filter(([k]) => k.includes(':FAIL')).reduce((s, [, v]) => s + v, 0) : 0}`);
  if (fails.length) { console.log('\nFirst failures:'); fails.forEach((f) => console.log(' ', f)); }
  h.server.close();
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
