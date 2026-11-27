const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { one, query } = require('../db');
const { startSession, endSession, publicUser, requireAuth } = require('../auth');
const { ah } = require('../utils');

const byEmail = (email) => one('select * from crm_users where lower(email) = lower($1)', [String(email).trim()]);

router.post('/login', ah(async (req, res) => {
  const { email, password, deviceId } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

  const user = await byEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  if (!user.active) return res.status(403).json({ message: 'Your account has been disabled. Contact admin.' });

  const token = await startSession(user, deviceId);
  if (!token) {
    return res.status(409).json({ message: 'This account is already logged in on another device. Only one person can use an account at a time. Ask them to log out, or try again after 1 hour of inactivity.' });
  }
  res.json({ token, user: publicUser(user) });
}));

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

// Sent by the app every few minutes while the person is actually using it (requireAuth refreshes the idle timer).
router.post('/ping', requireAuth, (_req, res) => res.json({ ok: true }));

// Frees the account so it can be logged in again.
router.post('/logout', requireAuth, ah(async (req, res) => {
  await endSession(req.user.id, req.sid);
  res.json({ message: 'Logged out' });
}));

// Self-service reset from the login screen: needs the current password.
router.post('/reset-password', ah(async (req, res) => {
  const { email, currentPassword, newPassword } = req.body || {};
  if (!email || !currentPassword || !newPassword) return res.status(400).json({ message: 'All fields are required' });
  if (String(newPassword).length < 6) return res.status(400).json({ message: 'New password must be at least 6 characters' });

  const user = await byEmail(email);
  if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
    return res.status(401).json({ message: 'Email or current password is incorrect' });
  }
  await query('update crm_users set password_hash = $1, active_session = null, session_device = null, session_seen = null where id = $2', [await bcrypt.hash(newPassword, 10), user.id]);
  res.json({ message: 'Password updated. Please log in with your new password.' });
}));

module.exports = router;
