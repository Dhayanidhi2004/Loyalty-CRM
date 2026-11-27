const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { one, query } = require('./db');
const { accessFor, dashboardFor, DEFAULT_ROLE, ROLES } = require('./roles');

const SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';

// A login is dropped after this much inactivity (minutes). Override with SESSION_IDLE_MINUTES in server/.env.
const IDLE_SECONDS = (Number(process.env.SESSION_IDLE_MINUTES) || 60) * 60;
const SESSION_FIELDS = ['password_hash', 'active_session', 'session_device', 'session_seen', 'idle_secs'];

function signToken(user, sid) {
  return jwt.sign({ id: Number(user.id), role: user.role, sid }, SECRET, { expiresIn: '7d' });
}

// One login per account. Claims the account's single session slot and returns a token, or null when someone else
// is already logged in (active within the idle limit). The same browser/device may log in again and replace its own
// session. The claim is one atomic UPDATE, so two simultaneous logins can never both win.
async function startSession(user, deviceId) {
  const sid = crypto.randomBytes(24).toString('hex');
  const device = String(deviceId || '').slice(0, 80) || null;
  const row = await one(
    `update crm_users set active_session = $1, session_device = $2, session_seen = now()
      where id = $3
        and (active_session is null or session_seen is null
             or session_seen < now() - make_interval(secs => $4)
             or ($2::text is not null and session_device = $2::text))
      returning id`,
    [sid, device, Number(user.id), IDLE_SECONDS]
  );
  return row ? signToken(user, sid) : null;
}

async function endSession(userId, sid) {
  await query('update crm_users set active_session = null, session_device = null, session_seen = null where id = $1 and active_session = $2', [Number(userId), sid]);
}

// Shape a DB row for the client: never send the password hash.
// Adds `loginRole` (Sales Head, Engineer, …) and the module `access` map the frontend uses
// to build each role's dashboard. access === null means admin (everything).
function publicUser(u) {
  if (!u) return null;
  const rest = { ...u };
  for (const k of SESSION_FIELDS) delete rest[k];
  const loginRole = rest.role === 'admin' ? 'Admin' : ROLES[rest.designation] ? rest.designation : DEFAULT_ROLE;
  return { ...rest, id: Number(rest.id), loginRole, access: accessFor(rest), dashboard: dashboardFor(rest) };
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Please log in' });
  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch {
    return res.status(401).json({ message: 'Session expired, please log in again' });
  }
  try {
    const user = await one('select u.*, extract(epoch from (now() - u.session_seen)) as idle_secs from crm_users u where u.id = $1', [payload.id]);
    if (!user || !user.active) return res.status(401).json({ message: 'Account not found or disabled' });
    // the token must be the account's one current login
    if (!payload.sid || payload.sid !== user.active_session) {
      return res.status(401).json({ message: 'You have been logged out. This account was logged in again elsewhere or the session ended. Please log in.' });
    }
    // idle for too long: end the session so the account is free again
    if (user.idle_secs === null || Number(user.idle_secs) > IDLE_SECONDS) {
      await endSession(user.id, payload.sid);
      return res.status(401).json({ message: 'You were logged out after 1 hour of inactivity. Please log in again.' });
    }
    // real activity keeps the session alive; background polling (X-Background) does not
    if (req.headers['x-background'] !== '1' && Number(user.idle_secs) > 15) {
      await query('update crm_users set session_seen = now() where id = $1 and active_session = $2', [user.id, payload.sid]);
    }
    req.sid = payload.sid;
    req.user = publicUser(user);
    next();
  } catch (e) {
    next(e);
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin access only' });
  next();
}

module.exports = { signToken, startSession, endSession, publicUser, requireAuth, requireAdmin, IDLE_SECONDS };
