require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const multer = require('multer');

const { one, many, initSchema } = require('./db');
const { modules, CONVERTED, NOT_CONVERTED } = require('./modules');
const { requireAuth } = require('./auth');
const { localDayRange, ah } = require('./utils');
const { saveFile, localDir, usingSupabaseStorage } = require('./storage');
const { ensureAdmin } = require('./seed');

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',') : true }));
app.use(express.json({ limit: '2mb' }));

// ---------- uploads (profile photos, PO/PI copies, resources) ----------
app.use('/uploads', express.static(localDir));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.post('/api/upload', requireAuth, upload.single('file'), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file received' });
  const folder = String(req.body.folder || 'misc').replace(/[^a-zA-Z0-9_-]/g, '');
  res.json({ url: await saveFile(req.file, folder), name: req.file.originalname });
}));

// ---------- API ----------
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/modules', requireAuth, (_req, res) => res.json(modules));

app.get('/api/stats', requireAuth, ah(async (req, res) => {
  const mine = req.user.role !== 'admin';
  const owner = mine ? 'and created_by = $1' : '';
  const ownerArgs = mine ? [req.user.id] : [];

  const rows = await many(`select module, count(*)::int as n from crm_records where true ${owner} group by module`, ownerArgs);
  const counts = Object.fromEntries(rows.map((r) => [r.module, r.n]));

  const [start, end] = localDayRange();
  const today = async (status) => {
    const n = ownerArgs.length;
    return (
      await one(
        `select count(*)::int as n from crm_records
         where module = 'leads' and status = $${n + 1} and status_changed_at >= $${n + 2} and status_changed_at < $${n + 3} ${owner}`,
        [...ownerArgs, status, start, end]
      )
    ).n;
  };
  const lowStock = (
    await one(
      `select count(*)::int as n from crm_records where module = 'inventory'
       and coalesce((data->>'current')::numeric, 0) <= coalesce((data->>'minStock')::numeric, 0)`
    )
  ).n;
  const employees = (await one("select count(*)::int as n from crm_users where role = 'employee'")).n;

  res.json({
    counts,
    todayConverted: await today(CONVERTED),
    todayNotConverted: await today(NOT_CONVERTED),
    lowStock,
    employees,
  });
}));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/records', require('./routes/records'));
app.use('/api/gmail', require('./routes/gmail'));
app.use('/api', (_req, res) => res.status(404).json({ message: 'Not found' }));

// ---------- serve the built React app in production ----------
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api|uploads).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  if (err.status && err.status < 500) return res.status(err.status).json({ message: err.message });
  if (err instanceof multer.MulterError) return res.status(400).json({ message: err.message });
  console.error(err);
  res.status(500).json({ message: 'Something went wrong on the server' });
});

// Plain-language fix for the usual Supabase connection mistakes.
function dbHint(e) {
  const msg = `${e.code || ''} ${e.message || ''}`;
  if (/28P01|password authentication failed/i.test(msg)) return 'Wrong database password. Replace [YOUR-PASSWORD] with your Supabase database password (Project Settings > Database > Reset database password if unsure).';
  if (/Tenant or user not found|tenant\/user .* not found/i.test(msg)) return 'Wrong user name or region. Copy the whole Session pooler URI again: the user must look like postgres.<project-ref>.';
  const badHost = /ENOTFOUND (\S+)\s*$/i.exec(e.message || "");
  if (badHost && !badHost[1].includes('.')) return `The URI breaks at "${badHost[1]}": your password probably contains @ # / or %. Reset it to letters and numbers only, or write @ as %40, # as %23, / as %2F, % as %25.`;
  if (/ENOTFOUND|EAI_AGAIN/i.test(msg)) return 'Host name not found. Check the URI was copied fully, and that you are online.';
  if (/ETIMEDOUT|ENETUNREACH|EHOSTUNREACH/i.test(msg)) return 'Network timed out. Use the "Session pooler" URI (port 5432, host ...pooler.supabase.com), not "Direct connection".';
  if (/Invalid URL|URI malformed|ERR_INVALID_URL|searchParams/i.test(msg)) return 'The URI is malformed, usually a password containing @ # / or %. Reset to a password with only letters and numbers.';
  if (/ECONNREFUSED/i.test(msg)) return 'Nothing is listening at that address. Check the host and port in the URI.';
  return 'Copy the Session pooler URI from Supabase > Connect again and paste it as DATABASE_URL.';
}

const PORT = Number(process.env.PORT) || 5000;
(async () => {
  try {
    await initSchema();
    await ensureAdmin();
  } catch (e) {
    console.error('\n  Could not connect to the database (DATABASE_URL in server/.env).');
    console.error(`  Error: ${e.message}`);
    console.error(`  Fix:   ${dbHint(e)}\n`);
    process.exit(1);
  }
  app.listen(PORT, () =>
    console.log(`CRM API running on http://localhost:${PORT}  (files: ${usingSupabaseStorage ? 'Supabase Storage' : 'local ./uploads'})`)
  );
})();
