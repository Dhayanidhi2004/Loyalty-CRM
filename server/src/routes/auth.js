const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { one, query } = require('../db');
const { signToken, publicUser, requireAuth } = require('../auth');
const { ah } = require('../utils');

const byEmail = (email) => one('select * from crm_users where lower(email) = lower($1)', [String(email).trim()]);

router.post('/login', ah(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

  const user = await byEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  if (!user.active) return res.status(403).json({ message: 'Your account has been disabled. Contact admin.' });

  res.json({ token: signToken(user), user: publicUser(user) });
}));

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

// Self-service reset from the login screen: needs the current password.
router.post('/reset-password', ah(async (req, res) => {
  const { email, currentPassword, newPassword } = req.body || {};
  if (!email || !currentPassword || !newPassword) return res.status(400).json({ message: 'All fields are required' });
  if (String(newPassword).length < 6) return res.status(400).json({ message: 'New password must be at least 6 characters' });

  const user = await byEmail(email);
  if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
    return res.status(401).json({ message: 'Email or current password is incorrect' });
  }
  await query('update crm_users set password_hash = $1 where id = $2', [await bcrypt.hash(newPassword, 10), user.id]);
  res.json({ message: 'Password updated. Please log in with your new password.' });
}));

module.exports = router;
