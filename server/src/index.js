require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');

const { initSchema } = require('./db');
const { ensureAdmin } = require('./seed');
const { usingSupabaseStorage } = require('./storage');
const app = require('./app');

// ---------- serve the built React app in production ----------
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api|uploads).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

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
