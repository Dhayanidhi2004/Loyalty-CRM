// Test harness: runs the REAL Express router + auth + roles code against a REAL Postgres (PGlite, WASM).
// Only the `pg` driver is swapped, so db.js / auth.js / routes/projectQuotations.js run unmodified.
const path = require('path');
const fs = require('fs');
const Module = require('module');

const SERVER = path.join(__dirname, '..', 'server');
process.env.DATABASE_URL = 'postgres://qa:qa@localhost:5432/qa';
process.env.JWT_SECRET = 'qa-secret';

const toNum = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])));

async function start(port) {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const run = async (text, params) => {
    const r = await db.query(text, params);
    return { rows: toNum(r.rows), rowCount: r.affectedRows ?? r.rows.length };
  };
  class Pool {
    query(t, p) { return run(t, p); }
    async connect() { return { query: (t, p) => run(t, p), release() {} }; }
    on() {}
  }
  const origLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'pg') return { Pool, types: { setTypeParser() {} } };
    return origLoad.call(this, request, ...rest);
  };

  await db.exec(fs.readFileSync(path.join(SERVER, 'supabase', 'schema.sql'), 'utf8'));

  const roles = [
    ['admin', 'Admin', 'admin'], ['saleshead', 'Sales Head', 'employee'], ['salesemp', 'Sales Employee', 'employee'],
    ['inventory', 'Inventory Manager', 'employee'], ['leadfiller', 'Lead Filler', 'employee'],
  ];
  const { startSession } = require(path.join(SERVER, 'src', 'auth.js'));
  const tokens = {};
  for (const [key, designation, role] of roles) {
    const r = await db.query('insert into crm_users (name, email, password_hash, role, designation) values ($1,$2,$3,$4,$5) returning id', [key, `${key}@qa.test`, 'x', role, designation]);
    tokens[key] = await startSession({ id: Number(r.rows[0].id), role }, `qa-${key}`);
  }

  const express = require(path.join(SERVER, 'node_modules', 'express'));
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/project-quotations', require(path.join(SERVER, 'src', 'routes', 'projectQuotations.js')));
  // test-only: wipe and reseed so every UI test starts from the 4 sample quotations
  app.post('/__reset', async (_req, res) => {
    await db.exec('truncate crm_project_quotations restart identity');
    await require(path.join(__dirname, 'fixtures', 'projectQuotationSamples.js')).seedProjectQuotations();
    res.json({ ok: true });
  });
  app.use((err, _req, res, _next) => res.status(500).json({ message: String(err.message || err) }));
  const server = await new Promise((ok) => { const s = app.listen(port, '127.0.0.1', () => ok(s)); });
  const { seedProjectQuotations } = require(path.join(__dirname, 'fixtures', 'projectQuotationSamples.js'));
  await seedProjectQuotations();
  return { server, tokens, base: `http://127.0.0.1:${server.address().port}`, db };
}

module.exports = { start };
