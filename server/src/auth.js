const jwt = require('jsonwebtoken');
const { one } = require('./db');
const { accessFor, dashboardFor, DEFAULT_ROLE, ROLES } = require('./roles');

const SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';

function signToken(user) {
  return jwt.sign({ id: Number(user.id), role: user.role }, SECRET, { expiresIn: '7d' });
}

// Shape a DB row for the client: never send the password hash.
// Adds `loginRole` (Sales Head, Engineer, …) and the module `access` map the frontend uses
// to build each role's dashboard. access === null means admin (everything).
function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
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
    const user = await one('select * from crm_users where id = $1', [payload.id]);
    if (!user || !user.active) return res.status(401).json({ message: 'Account not found or disabled' });
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

module.exports = { signToken, publicUser, requireAuth, requireAdmin };
