const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');

// bigint ids/counts -> JS numbers; plain dates stay as 'YYYY-MM-DD' strings (no timezone shift).
types.setTypeParser(20, (v) => Number(v));
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // numeric (salary)

if (!process.env.DATABASE_URL) {
  console.error('\n  DATABASE_URL is missing. Copy server/.env.example to server/.env and paste your Supabase connection string.\n');
  process.exit(1);
}
// still the sample value from .env.example
if (/x{8,}|\[YOUR-PASSWORD\]/i.test(process.env.DATABASE_URL)) {
  console.error('\n  DATABASE_URL in server/.env is still the example value.');
  console.error('  Supabase > your project > Connect > "Session pooler" > copy the URI, put your database password');
  console.error('  in place of [YOUR-PASSWORD] (no brackets), save server/.env, then stop and run npm run dev again.\n');
  process.exit(1);
}

// Supabase requires SSL; a local Postgres usually doesn't.
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'false' || isLocal ? false : { rejectUnauthorized: false },
  max: Number(process.env.PG_POOL_MAX) || 10,
});

const query = (text, params) => pool.query(text, params);
const one = async (text, params) => (await pool.query(text, params)).rows[0] || null;
const many = async (text, params) => (await pool.query(text, params)).rows;

// Runs fn(client) inside BEGIN/COMMIT; rolls back on error.
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function initSchema() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
  await pool.query(sql);
}

module.exports = { pool, query, one, many, tx, initSchema };
