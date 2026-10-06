const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { one, many, query, tx } = require('../db');
const { publicUser, requireAuth, requireAdmin } = require('../auth');
const { modules, RESOURCE_STATUSES, CONVERTED } = require('../modules');
const { ROLE_NAMES, accessFor, levelFor, can } = require('../roles');
const { EMAIL_RE, ah, newEmployeeCode } = require('../utils');

router.use(requireAuth);
router.param('id', (req, res, next, id) => (/^\d+$/.test(id) ? next() : res.status(404).json({ message: 'Employee not found' })));

// Role names for the Registration Page dropdown
router.get('/roles', (_req, res) => res.json({ roles: ROLE_NAMES, resourceStatuses: RESOURCE_STATUSES }));

// People a Sales Head (or admin) can hand a lead to: the active sales team (roles that work leads and quote).
router.get('/assignable', ah(async (req, res) => {
  if (!can.editAll(levelFor(req.user, 'leads'))) return res.status(403).json({ message: 'Not allowed' });
  const rows = await many("select id, name, emp_code, designation, role from crm_users where active and role = 'employee' order by name");
  const sells = (u) => can.create(accessFor(u)?.leads) && can.create(accessFor(u)?.quotations);
  res.json(rows.filter(sells).map((u) => ({ id: Number(u.id), name: u.name, code: u.emp_code, role: u.designation })));
}));

// "Sales Head ID" list on the enquiry form: active Sales Heads, for anyone who can add enquiries.
router.get('/sales-heads', ah(async (req, res) => {
  if (!can.create(levelFor(req.user, 'leads'))) return res.status(403).json({ message: 'Not allowed' });
  const rows = await many("select id, name, emp_code from crm_users where active and role = 'employee' and designation = 'Sales Head' order by name");
  res.json(rows.map((u) => ({ id: Number(u.id), name: u.name, code: u.emp_code, role: 'Sales Head' })));
}));

const byEmail = (email) => one('select * from crm_users where lower(email) = lower($1)', [String(email).trim()]);

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

// Fields from the Registration Page that map straight onto columns.
const PROFILE_FIELDS = ['name', 'phone', 'designation', 'department', 'joining_date', 'address', 'photo', 'salary', 'ending_date', 'remarks', 'document'];

function cleanProfile(b) {
  const out = {};
  for (const k of PROFILE_FIELDS) {
    if (!(k in b)) continue;
    let v = typeof b[k] === 'string' ? b[k].trim() : b[k];
    if (v === '' || v === undefined) v = null;
    if (k === 'salary' && v !== null) {
      v = Number(v);
      if (Number.isNaN(v) || v < 0) throw badRequest('Current salary must be a valid amount');
    }
    out[k] = v;
  }
  if ('resources' in b) {
    if (!Array.isArray(b.resources)) throw badRequest('Company resources must be a list');
    // one row per item handed over: { name: 'Laptop', code: '#PD12', endDate: '2026-04-29', status: 'provided' }
    out.resources = JSON.stringify(
      b.resources
        .map((r) => ({
          name: String(r?.name || '').trim(),
          code: String(r?.code ?? r?.details ?? '').trim(),
          endDate: /^\d{4}-\d{2}-\d{2}$/.test(r?.endDate || '') ? r.endDate : null,
          status: RESOURCE_STATUSES.includes(r?.status) ? r.status : 'provided',
        }))
        .filter((r) => r.name || r.code)
        .slice(0, 50)
    );
  }
  if (out.ending_date && out.joining_date && out.ending_date < out.joining_date) {
    throw badRequest('Ending date cannot be before joining date');
  }
  return out;
}

// Employees may read their own profile; everything else is admin only.
router.get('/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  if (req.user.role !== 'admin' && req.user.id !== id) return res.status(403).json({ message: 'Not allowed' });

  const user = await one('select * from crm_users where id = $1', [id]);
  if (!user) return res.status(404).json({ message: 'Employee not found' });

  const rows = await many('select module, count(*)::int as n from crm_records where created_by = $1 group by module', [id]);
  const counts = Object.fromEntries(rows.map((r) => [r.module, r.n]));
  const { n: converted } = await one(
    `select count(*)::int as n from crm_records where module = 'leads' and status = $2
     and (created_by = $1 or data->>'assignedTo' = $1::text)`,
    [id, CONVERTED]
  );
  const access = accessFor(user); // null for admins = every module
  const stats = Object.keys(modules)
    .filter((k) => k !== 'inventory' && (access === null || access[k]))
    .map((key) => ({ module: key, label: modules[key].label, count: counts[key] || 0 }));
  res.json({ employee: publicUser(user), stats, convertedLeads: converted });
}));

router.use(requireAdmin);

router.get('/', ah(async (req, res) => {
  const q = `%${req.query.search || ''}%`;
  const rows = await many(
    `select * from crm_users
     where (name ilike $1 or email ilike $1 or coalesce(designation,'') ilike $1 or coalesce(phone,'') ilike $1 or coalesce(emp_code,'') ilike $1)
     ${req.query.includeAdmins ? '' : "and role = 'employee'"}
     order by created_at desc`,
    [q]
  );
  res.json(rows.map(publicUser));
}));

// Registration Page
router.post('/', ah(async (req, res) => {
  const b = req.body || {};
  if (!b.name?.trim() || !b.email?.trim() || !b.password) return res.status(400).json({ message: 'Name, email and password are required' });
  if (!EMAIL_RE.test(b.email.trim())) return res.status(400).json({ message: 'Enter a valid email' });
  if (String(b.password).length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
  if (await byEmail(b.email)) return res.status(409).json({ message: 'An account with this email already exists' });
  const isAdmin = b.role === 'admin';
  if (!isAdmin && !ROLE_NAMES.includes(b.designation)) return res.status(400).json({ message: 'Please choose a role' });

  const fields = {
    ...cleanProfile(b),
    email: b.email.trim(),
    password_hash: await bcrypt.hash(b.password, 10),
    role: isAdmin ? 'admin' : 'employee',
  };
  const user = await tx(async (client) => {
    fields.emp_code = await newEmployeeCode(client);
    const keys = Object.keys(fields);
    const { rows } = await client.query(
      `insert into crm_users (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning *`,
      keys.map((k) => fields[k])
    );
    return rows[0];
  });
  res.status(201).json(publicUser(user));
}));

// Registration Page in edit mode, plus enable/disable from the profile page
router.put('/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  const user = await one('select * from crm_users where id = $1', [id]);
  if (!user) return res.status(404).json({ message: 'Employee not found' });
  const b = req.body || {};

  const updates = cleanProfile(b);
  if ('name' in updates && !updates.name) return res.status(400).json({ message: 'Name is required' });
  const becomesEmployee = (b.role || user.role) === 'employee';
  if (becomesEmployee && 'designation' in updates && !ROLE_NAMES.includes(updates.designation) && updates.designation !== user.designation) {
    return res.status(400).json({ message: 'Please choose a valid role' });
  }
  if (typeof b.email === 'string' && b.email.trim().toLowerCase() !== user.email.toLowerCase()) {
    if (!EMAIL_RE.test(b.email.trim())) return res.status(400).json({ message: 'Enter a valid email' });
    const clash = await byEmail(b.email);
    if (clash && clash.id !== id) return res.status(409).json({ message: 'That email is already in use' });
    updates.email = b.email.trim();
  }
  if (b.password) {
    if (String(b.password).length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
    updates.password_hash = await bcrypt.hash(b.password, 10);
  }
  if (b.role && b.role !== user.role) {
    if (id === req.user.id) return res.status(400).json({ message: "You can't change your own access level" });
    updates.role = b.role === 'admin' ? 'admin' : 'employee';
  }
  if ('active' in b) {
    if (id === req.user.id && !b.active) return res.status(400).json({ message: "You can't disable your own account" });
    updates.active = !!b.active;
  }
  const keys = Object.keys(updates);
  if (!keys.length) return res.json(publicUser(user));

  const set = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const updated = await one(`update crm_users set ${set} where id = $${keys.length + 1} returning *`, [...keys.map((k) => updates[k]), id]);
  res.json(publicUser(updated));
}));

router.delete('/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ message: "You can't delete your own account" });
  const r = await query('delete from crm_users where id = $1', [id]);
  if (!r.rowCount) return res.status(404).json({ message: 'Employee not found' });
  res.json({ message: 'Employee deleted' });
}));

// Finds the employee a reset applies to: by id (from a profile page), email, or name (quick-action pages).
// Employee ID as shown on profiles: "LOY-325332" (the "LOY-" can be left out).
const normCode = (c) => {
  const v = String(c || '').trim().toUpperCase();
  return /^\d+$/.test(v) ? `LOY-${v}` : v;
};

async function findTarget({ id, email, name, empCode }) {
  if (id) return { user: await one('select * from crm_users where id = $1', [Number(id)]) };
  if (empCode !== undefined) {
    if (!String(empCode).trim()) return { error: 'Enter the Employee ID' };
    const user = await one('select * from crm_users where upper(emp_code) = $1', [normCode(empCode)]);
    return user ? { user } : { error: `No employee with ID ${normCode(empCode)}`, status: 404 };
  }
  if (email) return { user: await byEmail(email) };
  if (name?.trim()) {
    const rows = await many('select * from crm_users where lower(name) = lower($1)', [name.trim()]);
    if (rows.length > 1) {
      return { error: `There are ${rows.length} employees named "${name.trim()}". Open the right one from View Profiles and reset it from their profile.` };
    }
    return { user: rows[0] || null };
  }
  return { error: 'Enter the employee name' };
}

// Quick action: Reset Employee Email  { name | id | currentEmail, newEmail }
router.post('/reset-email', ah(async (req, res) => {
  const b = req.body || {};
  const newEmail = String(b.newEmail || '').trim();
  if (!EMAIL_RE.test(newEmail)) return res.status(400).json({ message: 'Enter a valid new email' });

  const { user, error } = await findTarget({ id: b.id, email: b.currentEmail, name: b.name });
  if (error) return res.status(400).json({ message: error });
  if (!user) return res.status(404).json({ message: 'No employee found with that name' });
  const clash = await byEmail(newEmail);
  if (clash && clash.id !== user.id) return res.status(409).json({ message: 'That email is already in use' });

  await query('update crm_users set email = $1 where id = $2', [newEmail, user.id]);
  res.json({ message: `Email updated for ${user.name}` });
}));

// Quick action: Reset Employee Password  { empCode | id | name | email, newPassword }
router.post('/reset-password', ah(async (req, res) => {
  const b = req.body || {};
  const { user, error, status } = await findTarget(b);
  if (error) return res.status(status || 400).json({ message: error });
  if (!user) return res.status(404).json({ message: 'No employee found with that name' });
  if (String(b.newPassword || '').length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
  await query('update crm_users set password_hash = $1 where id = $2', [await bcrypt.hash(b.newPassword, 10), user.id]);
  res.json({ message: `Password reset for ${user.name}${user.emp_code ? ` (${user.emp_code})` : ''}` });
}));

module.exports = router;
