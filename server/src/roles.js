// Login roles chosen on the Registration Page, and what each one can do.
//
// Access levels per module:
//   own    -> create, and see/edit only their own records (for leads: also leads assigned to them)
//   all    -> create, and see/edit everyone's records (team lead view)
//   full   -> like `all`, and may also delete (Sales Head on the sales pipeline)
//   read   -> look only
//   manage -> create, see and edit everyone's records (reference data such as inventory)
//   service -> leads only: look at every enquiry with Enquiry Type "Service" (Service Engineer)
// Otherwise deleting is admin-only. Admins can do everything.
//
// To add a role: add it here, and it appears in the Role dropdown and gets its own dashboard.

const ROLES = {
  'Sales Head': {
    leads: 'full', customers: 'all', quotationRequests: 'all', quotations: 'full', poRequests: 'full',
    pi: 'full', salesOrders: 'all', workVisits: 'all', inventory: 'read',
  },
  Engineer: {
    workVisits: 'own', serviceDetails: 'own', productRequests: 'own', inventory: 'read',
  },
  // Own dashboard (/ServiceProject/Dashboard): "Service Project Data" lists every enquiry whose
  // Enquiry Type is Service (read only), plus their work visits, service details and inventory.
  'Service Engineer': {
    leads: 'service', workVisits: 'own', serviceDetails: 'own', productRequests: 'own', inventory: 'read',
  },
  'Sales Employee': {
    leads: 'own', customers: 'own', quotationRequests: 'own', quotations: 'own', poRequests: 'own',
    pi: 'own', salesOrders: 'own', workVisits: 'own', inventory: 'read',
  },
  // Same Analytics Dashboard as the sales team; manages stock, POs and PIs, views customers and quotations.
  'Inventory Manager': {
    leads: 'own', customers: 'read', quotations: 'read', poRequests: 'all', pi: 'all',
    inventory: 'manage', productRequests: 'all',
  },
  // Own dashboard: enters enquiries for a Sales Head, and pulls leads out of a Gmail inbox.
  // emailLeads is a feature, not a module: the Email Lead Intelligence page (routes/gmail.js).
  'Lead Filler': {
    leads: 'own', emailLeads: 'own',
  },
  // Same Analytics Dashboard as the Sales Employee (8 buttons, "Closed" card): keeps stock up to date,
  // raises POs and PIs, works leads assigned to them, views customers and quotations.
  'Stock Filler': {
    leads: 'own', customers: 'read', quotations: 'read', poRequests: 'own', pi: 'own', inventory: 'manage',
  },
};

// Roles with their own dashboard instead of the standard employee one:
// 'sales' -> Analytics Dashboard (/SaleteamDasboard/Dasboard), 'leads' -> Lead Filler dashboard,
// 'service' -> Service Engineer dashboard.
const DASHBOARDS = {
  'Sales Head': 'sales',
  'Sales Employee': 'sales',
  'Inventory Manager': 'sales',
  'Stock Filler': 'sales',
  'Lead Filler': 'leads', // /leadfiller/dashboard
  'Service Engineer': 'service', // /ServiceProject/Dashboard
};

const ROLE_NAMES = Object.keys(ROLES);

// Accounts created before roles existed fall back to Sales Employee access.
const DEFAULT_ROLE = 'Sales Employee';

const roleOf = (user) => (ROLES[user?.designation] ? user.designation : DEFAULT_ROLE);

function accessFor(user) {
  if (!user) return {};
  if (user.role === 'admin') return null; // null = everything
  return ROLES[roleOf(user)];
}

function dashboardFor(user) {
  if (!user || user.role === 'admin') return 'admin';
  return DASHBOARDS[roleOf(user)] || 'employee';
}

// level for one module, or null when the user has no access at all
function levelFor(user, moduleKey) {
  const access = accessFor(user);
  if (access === null) return 'admin';
  return access[moduleKey] || null;
}

const can = {
  read: (lvl) => !!lvl,
  create: (lvl) => ['admin', 'own', 'all', 'full', 'manage'].includes(lvl),
  seeAll: (lvl) => ['admin', 'all', 'full', 'manage', 'read'].includes(lvl),
  editAll: (lvl) => ['admin', 'all', 'full', 'manage'].includes(lvl),
  delete: (lvl) => lvl === 'admin' || lvl === 'full',
};

module.exports = { ROLES, ROLE_NAMES, DEFAULT_ROLE, accessFor, dashboardFor, levelFor, can };
