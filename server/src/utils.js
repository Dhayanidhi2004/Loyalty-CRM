// The business runs on local (IST by default) days, but timestamps are stored in UTC.
const TZ_OFFSET_MIN = Number(process.env.TZ_OFFSET_MINUTES ?? 330);

// [start, end) of "today" in the configured timezone, as ISO strings.
function localDayRange(date = new Date()) {
  const shifted = new Date(date.getTime() + TZ_OFFSET_MIN * 60000);
  const startLocal = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  const start = new Date(startLocal - TZ_OFFSET_MIN * 60000);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return [start.toISOString(), end.toISOString()];
}

// YYYY-MM-DD (local) -> UTC instant of that local midnight (or the next one).
function localDateToISO(ymd, endOfDay = false) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + (endOfDay ? 1 : 0)) - TZ_OFFSET_MIN * 60000).toISOString();
}

// Indian financial year (April–March) as "25-26".
function financialYear(date = new Date()) {
  const local = new Date(date.getTime() + TZ_OFFSET_MIN * 60000);
  const y = local.getUTCFullYear() % 100;
  const start = local.getUTCMonth() >= 3 ? y : y - 1;
  return `${String(start).padStart(2, '0')}-${String(start + 1).padStart(2, '0')}`;
}

const DOC_PREFIX = process.env.DOC_PREFIX || 'LAP';

const randomDigits = (digits) => String(Math.floor(10 ** (digits - 1) + Math.random() * 9 * 10 ** (digits - 1)));

// Fills an autoNumber field (see modules.js). Pass a transaction client.
//   { style: 'fy', code: 'PO', pad: 3 }        -> LAP/PO/26-27/001  (sequence per code per financial year)
//   { style: 'random', code: 'CUS', digits: 6 } -> CUS-482913        (retries until unique in that module/field)
//   { style: 'hex', code: 'Pi' }               -> Pi-85b15671
// `unique` = { module, field } to check random numbers against existing records.
// `fyOverride` ('26-27') replaces the current financial year for 'fy' numbers.
async function generateNumber(client, auto, unique, fyOverride) {
  if (auto.style === 'hex') return `${auto.code}-${require('crypto').randomBytes(4).toString('hex')}`;
  if (auto.style === 'random') {
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = `${auto.code}-${randomDigits(auto.digits || 6)}`;
      if (!unique) return candidate;
      const { rows } = await client.query('select 1 from crm_records where module = $1 and data->>$2 = $3 limit 1', [unique.module, unique.field, candidate]);
      if (!rows.length) return candidate;
    }
    return `${auto.code}-${Date.now().toString().slice(-((auto.digits || 6) + 2))}`;
  }
  const fy = /^\d{2}-\d{2}$/.test(fyOverride || '') ? fyOverride : financialYear();
  const name = `${auto.code}/${fy}`;
  const { rows } = await client.query(
    `insert into crm_counters (name, value) values ($1, 1)
     on conflict (name) do update set value = crm_counters.value + 1
     returning value`,
    [name]
  );
  return `${DOC_PREFIX}/${auto.code}/${fy}/${String(rows[0].value).padStart(auto.pad ?? 3, '0')}`;
}

// Employee code shown as "ID: LOY-325332" across the CRM.
async function newEmployeeCode(client) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = `LOY-${randomDigits(6)}`;
    const { rows } = await client.query('select 1 from crm_users where emp_code = $1', [code]);
    if (!rows.length) return code;
  }
  return `LOY-${Date.now().toString().slice(-8)}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Wraps async route handlers so thrown errors reach the error middleware.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { localDayRange, localDateToISO, generateNumber, newEmployeeCode, financialYear, EMAIL_RE, ah };
