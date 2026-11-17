// The CRM API as an Express app (no port, no database start-up), so index.js can run it and the tests can load it as-is.
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');

const { one, many } = require('./db');
const { modules, CONVERTED, NOT_CONVERTED } = require('./modules');
const { requireAuth } = require('./auth');
const { localDayRange, ah } = require('./utils');
const { saveFile, localDir } = require('./storage');

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',') : true }));
app.use(express.json({ limit: '10mb' })); // big stock / customer imports are sent in parts but can still be a few MB

// ---------- uploads (profile photos, PO/PI copies, resources) ----------
const MAX_UPLOAD_MB = 10;
const PICTURE = /\.(png|jpe?g|gif|webp|bmp)$/i;
const ALLOWED = /\.(png|jpe?g|gif|webp|bmp|pdf|docx?|xlsx?|xlsm|csv|txt|pptx?)$/i; // never .html / .svg / .exe / .js: those could run inside the CRM
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 } });
const utf8Name = (n) => { const s = String(n || ''); const f = Buffer.from(s, 'latin1').toString('utf8'); return f.includes('�') ? s : f; };

app.use('/uploads', express.static(localDir, {
  setHeaders(res, file) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!PICTURE.test(file)) res.setHeader('Content-Disposition', 'attachment'); // documents download instead of opening as a page
  },
}));

app.post('/api/upload', requireAuth, upload.single('file'), ah(async (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ message: 'No file received' });
  if (!f.size) return res.status(400).json({ message: 'The file is empty' });
  const name = utf8Name(f.originalname);
  const folder = String(req.body.folder || 'misc').replace(/[^a-zA-Z0-9_-]/g, '');
  if (folder === 'profiles' && !PICTURE.test(name)) return res.status(400).json({ message: 'A profile photo must be a picture (PNG, JPG, WEBP or GIF)' });
  if (!ALLOWED.test(name)) return res.status(400).json({ message: 'This file type is not allowed. Upload a picture, PDF, Word, Excel, CSV or text file.' });
  res.json({ url: await saveFile({ ...f, originalname: name }, folder), name });
}));

// ---------- API ----------
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/modules', requireAuth, (_req, res) => res.json(modules));

app.get('/api/stats', requireAuth, ah(async (req, res) => {
  const mine = req.user.role !== 'admin';
  // "mine" = records I created, plus enquiries assigned to me
  const owner = mine ? "and (created_by = $1 or (module = 'leads' and data->>'assignedTo' = $1::text))" : '';
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
app.use('/api/customer-extract', require('./routes/customerExtract'));
app.use('/api/inventory-import', require('./routes/inventoryImport'));
app.use('/api/records', require('./routes/records'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/project-quotations', require('./routes/projectQuotations'));
app.use('/api/gmail', require('./routes/gmail'));
app.use('/api', (_req, res) => res.status(404).json({ message: 'Not found' }));

app.use((err, req, res, _next) => {
  if (err.status && err.status < 500) return res.status(err.status).json({ message: err.message });
  if (err instanceof multer.MulterError) {
    const mb = /customer-extract|inventory-import/.test(req.originalUrl) ? 25 : MAX_UPLOAD_MB;
    return res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? `That file is too large (limit ${mb} MB)` : err.message });
  }
  console.error(err);
  res.status(500).json({ message: 'Something went wrong on the server' });
});

module.exports = app;
