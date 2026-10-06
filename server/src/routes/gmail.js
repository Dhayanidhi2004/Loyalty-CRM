// Email Lead Intelligence: connect a Gmail inbox (read-only), scan it, keep the messages that look
// like enquiries so a Lead Filler can turn them into Lead Enquiries.
//
// Google setup (see README): an OAuth client of type "Web application" with the redirect URI
// GOOGLE_REDIRECT_URI and the Gmail API enabled. Set GMAIL_MOCK=1 to try the page with sample mail.
const router = require('express').Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { one, many, query } = require('../db');
const { requireAuth } = require('../auth');
const { levelFor, can } = require('../roles');
const { ah } = require('../utils');
const { extractLead, messageFromGmail } = require('../emailLeads');
const sampleInbox = require('../gmailSamples');

const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const MOCK = process.env.GMAIL_MOCK === '1';
const MOCK_EMAIL = process.env.GMAIL_MOCK_EMAIL || 'leadfiller@gmail.com';
const google = () => ({
  id: process.env.GOOGLE_CLIENT_ID,
  secret: process.env.GOOGLE_CLIENT_SECRET,
  redirect: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5173/api/gmail/callback',
});
const configured = () => MOCK || !!(google().id && google().secret);
const PAGE = '/leadfiller/emailLeads';

const fail = (status, message) => Object.assign(new Error(message), { status });

// ---------- token storage (encrypted at rest) ----------
const KEY = crypto.createHash('sha256').update(`gmail-tokens:${SECRET}`).digest();
function seal(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
function unseal(sealed) {
  if (!sealed) return null;
  try {
    const [iv, tag, enc] = sealed.split('.').map((s) => Buffer.from(s, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch {
    return null; // JWT_SECRET changed: the user simply connects again
  }
}

// ---------- Google calls ----------
async function tokenRequest(params) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: google().id, client_secret: google().secret, ...params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(fail(424, `Google sign-in failed: ${body.error_description || body.error || res.status}`), { googleError: body.error });
  return body;
}

async function gmailGet(token, path) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw fail(409, 'Gmail access expired. Click Connect Gmail again.');
  if (res.status === 403) throw fail(403, `Gmail refused the request: ${body.error?.message || 'check that the Gmail API is enabled in Google Cloud'}`);
  if (!res.ok) throw fail(424, `Gmail error: ${body.error?.message || res.status}`);
  return body;
}

// A valid access token for this user, refreshing it when it is about to expire.
async function accessToken(userId) {
  const row = await one('select * from crm_gmail where user_id = $1', [userId]);
  if (!row) throw fail(400, 'Connect Gmail first');
  const current = unseal(row.access_token);
  if (current && row.expires_at && new Date(row.expires_at).getTime() > Date.now() + 60_000) return current;
  const refresh = unseal(row.refresh_token);
  if (!refresh) throw fail(409, 'Gmail access expired. Click Connect Gmail again.');
  try {
    const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh });
    await query('update crm_gmail set access_token = $1, expires_at = $2, updated_at = now() where user_id = $3', [
      seal(t.access_token), new Date(Date.now() + (t.expires_in || 3600) * 1000), userId,
    ]);
    return t.access_token;
  } catch (e) {
    if (e.googleError === 'invalid_grant') {
      await query('delete from crm_gmail where user_id = $1', [userId]);
      throw fail(409, 'Gmail access was revoked or expired. Click Connect Gmail again.');
    }
    throw e;
  }
}

// ---------- OAuth callback (Google redirects the browser here, so no Bearer token) ----------
router.get('/callback', ah(async (req, res) => {
  const back = (result) => res.redirect(`${new URL(google().redirect).origin}${PAGE}?gmail=${result}`);
  if (req.query.error) return back('denied');
  let userId;
  try {
    const st = jwt.verify(String(req.query.state || ''), SECRET);
    if (st.purpose !== 'gmail') throw new Error('bad state');
    userId = st.id;
  } catch {
    return back('expired');
  }
  try {
    const t = await tokenRequest({ grant_type: 'authorization_code', code: String(req.query.code || ''), redirect_uri: google().redirect });
    const profile = await gmailGet(t.access_token, 'profile');
    await query(
      `insert into crm_gmail (user_id, email, refresh_token, access_token, expires_at, updated_at)
       values ($1, $2, $3, $4, $5, now())
       on conflict (user_id) do update set email = excluded.email,
         refresh_token = coalesce(excluded.refresh_token, crm_gmail.refresh_token),
         access_token = excluded.access_token, expires_at = excluded.expires_at, updated_at = now()`,
      [userId, profile.emailAddress, seal(t.refresh_token), seal(t.access_token), new Date(Date.now() + (t.expires_in || 3600) * 1000)]
    );
    back('connected');
  } catch (e) {
    console.error('Gmail connect failed:', e.message);
    back('failed');
  }
}));

// ---------- everything else needs a logged-in user with access to Email Leads ----------
router.use(requireAuth);
router.use((req, res, next) => (can.create(levelFor(req.user, 'emailLeads')) ? next() : res.status(403).json({ message: "Your role doesn't have Email Leads" })));
router.param('id', (req, res, next, id) => (/^\d+$/.test(id) ? next() : res.status(404).json({ message: 'Not found' })));

const shapeLead = (r) => ({
  id: Number(r.id),
  messageId: r.message_id,
  fromName: r.from_name,
  fromEmail: r.from_email,
  subject: r.subject,
  snippet: r.snippet,
  body: r.body,
  phone: r.phone,
  company: r.company,
  city: r.city,
  category: r.category,
  priority: r.priority,
  score: r.score,
  reasons: r.reasons,
  status: r.status,
  leadId: r.lead_id ? Number(r.lead_id) : null,
  leadEnqNo: r.lead_enq_no ?? null,
  receivedAt: r.received_at,
});

router.get('/status', ah(async (req, res) => {
  const row = await one('select email, last_scan_at from crm_gmail where user_id = $1', [req.user.id]);
  const { n: salesHeads } = await one("select count(*)::int as n from crm_users where active and role = 'employee' and designation = 'Sales Head'");
  const counts = Object.fromEntries(
    (await many('select status, count(*)::int as n from crm_email_leads where user_id = $1 group by status', [req.user.id])).map((r) => [r.status, r.n])
  );
  res.json({
    configured: configured(),
    mock: MOCK,
    connected: !!row,
    email: row?.email || null,
    lastScanAt: row?.last_scan_at || null,
    salesHeads,
    counts: { new: counts.new || 0, converted: counts.converted || 0, ignored: counts.ignored || 0 },
  });
}));

// Link for the "Connect Gmail" button
router.get('/auth-url', ah(async (req, res) => {
  if (MOCK) {
    await query(
      `insert into crm_gmail (user_id, email, updated_at) values ($1, $2, now())
       on conflict (user_id) do update set email = excluded.email, updated_at = now()`,
      [req.user.id, MOCK_EMAIL]
    );
    return res.json({ url: `${PAGE}?gmail=connected` });
  }
  if (!configured()) throw fail(400, 'Gmail is not set up on the server yet: add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to server/.env (see README).');
  const state = jwt.sign({ id: req.user.id, purpose: 'gmail' }, SECRET, { expiresIn: '10m' });
  const params = new URLSearchParams({
    client_id: google().id,
    redirect_uri: google().redirect,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
}));

router.post('/disconnect', ah(async (req, res) => {
  const row = await one('select refresh_token from crm_gmail where user_id = $1', [req.user.id]);
  const token = unseal(row?.refresh_token);
  if (token && !MOCK) {
    fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {});
  }
  await query('delete from crm_gmail where user_id = $1', [req.user.id]);
  res.json({ message: 'Gmail disconnected' });
}));

// Run `fn` over `items`, `limit` at a time.
async function pool(items, limit, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }));
  return out;
}

// POST /api/gmail/scan { days = 30, max = 100 }
router.post('/scan', ah(async (req, res) => {
  const days = Math.min(Math.max(Number(req.body?.days) || 30, 1), 365);
  const max = Math.min(Math.max(Number(req.body?.max) || 100, 1), 500);
  const conn = await one('select email from crm_gmail where user_id = $1', [req.user.id]);
  if (!conn) throw fail(400, 'Connect Gmail first');

  const known = new Set((await many('select message_id from crm_email_leads where user_id = $1', [req.user.id])).map((r) => r.message_id));
  let messages;
  let listed;
  if (MOCK) {
    messages = sampleInbox().filter((m) => !known.has(m.id));
    listed = messages.length + known.size;
  } else {
    const token = await accessToken(req.user.id);
    const ids = [];
    let pageToken;
    const q = `in:inbox newer_than:${days}d -category:promotions -category:social`;
    do {
      const page = await gmailGet(token, `messages?${new URLSearchParams({ q, maxResults: String(Math.min(100, max - ids.length)), ...(pageToken ? { pageToken } : {}) })}`);
      ids.push(...(page.messages || []).map((m) => m.id));
      pageToken = page.nextPageToken;
    } while (pageToken && ids.length < max);
    listed = ids.length;
    const fresh = ids.filter((id) => !known.has(id));
    messages = (await pool(fresh, 5, (id) => gmailGet(token, `messages/${id}?format=full`).then(messageFromGmail).catch(() => null))).filter(Boolean);
  }

  const self = (conn.email || '').toLowerCase();
  let found = 0;
  for (const m of messages) {
    if (m.fromEmail && m.fromEmail === self) continue; // mail you sent yourself
    const r = extractLead(m);
    if (!r.isLead) continue;
    const ins = await query(
      `insert into crm_email_leads (user_id, message_id, thread_id, from_name, from_email, subject, snippet, body, phone, company, city,
                                    category, priority, score, reasons, received_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) on conflict (user_id, message_id) do nothing`,
      [req.user.id, m.id, m.threadId, r.contactName, m.fromEmail, m.subject, m.snippet, r.body, r.phone, r.company, r.city,
        r.category, r.priority, r.score, JSON.stringify(r.reasons), m.receivedAt]
    );
    found += ins.rowCount;
  }
  await query('update crm_gmail set last_scan_at = now() where user_id = $1', [req.user.id]);
  res.json({ scanned: listed, checked: messages.length, found, message: `Scanned ${listed} emails, found ${found} new lead${found === 1 ? '' : 's'}` });
}));

// GET /api/gmail/leads?status=new|converted|ignored
router.get('/leads', ah(async (req, res) => {
  const status = ['new', 'converted', 'ignored'].includes(req.query.status) ? req.query.status : null;
  const rows = await many(
    `select e.*, r.data->>'enqNo' as lead_enq_no from crm_email_leads e left join crm_records r on r.id = e.lead_id
     where e.user_id = $1 ${status ? 'and e.status = $2' : ''} order by e.received_at desc nulls last, e.id desc limit 500`,
    status ? [req.user.id, status] : [req.user.id]
  );
  res.json(rows.map(shapeLead));
}));

// Ignore / restore a found email
router.patch('/leads/:id', ah(async (req, res) => {
  const status = req.body?.status;
  if (!['new', 'ignored'].includes(status)) throw fail(400, 'Status must be new or ignored');
  const row = await one("update crm_email_leads set status = $1 where id = $2 and user_id = $3 and status <> 'converted' returning *", [status, Number(req.params.id), req.user.id]);
  if (!row) throw fail(404, 'Email lead not found');
  res.json(shapeLead(row));
}));

module.exports = router;
