// Mirrors server/src/roles.js. user.access is null for admins (everything),
// otherwise { moduleKey: 'own' | 'all' | 'full' | 'read' | 'manage' }.
export const levelOf = (user, moduleKey) => {
  if (!user) return null;
  if (user.role === 'admin' || user.access === null) return 'admin';
  return user.access?.[moduleKey] || null;
};

export const canCreate = (lvl) => ['admin', 'own', 'all', 'full', 'manage'].includes(lvl);
export const canSeeAll = (lvl) => ['admin', 'all', 'full', 'manage', 'read'].includes(lvl);
export const canEditAll = (lvl) => ['admin', 'all', 'full', 'manage'].includes(lvl);
export const canDelete = (lvl) => lvl === 'admin' || lvl === 'full';

// "own" covers records you created and, for leads, leads assigned to you.
export const ownsRecord = (record, user) =>
  record?.createdBy === user?.id || (record?.module === 'leads' && String(record?.assignedTo ?? '') === String(user?.id));
export const canEditRecord = (lvl, record, user) => canEditAll(lvl) || (canCreate(lvl) && ownsRecord(record, user));

// Roles offered on the Registration Page (the server sends the live list; this is the fallback).
export const LOGIN_ROLES = ['Sales Head', 'Engineer', 'Service Engineer', 'Sales Employee', 'Inventory Manager', 'Lead Filler', 'Stock Filler'];

// Lead pipeline (server/src/modules.js)
export const LEAD_STAGES = ['New Lead', 'Assigned', 'Quoted', 'Closed: Won', 'Closed: Lost'];
export const CONVERTED = 'Closed: Won';
export const NOT_CONVERTED = 'Closed: Lost';

// Where each login lands: admin dashboard, the sales team Analytics Dashboard (Sales Head / Sales Employee /
// Inventory Manager / Stock Filler), the Lead Filler and Service Engineer dashboards, or the standard
// employee dashboard (Engineer).
const HOMES = { sales: '/SaleteamDasboard/Dasboard', leads: '/leadfiller/dashboard', service: '/ServiceProject/Dashboard' };
export const homeFor = (user) =>
  user?.role === 'admin' ? '/admin/adminDasboard' : HOMES[user?.dashboard] || '/employee/dashboard';
