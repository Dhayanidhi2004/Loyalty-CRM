// Branding shown in the top header. Put your logo at client/public/logo.png
// (about 260x60) and it replaces the text logo automatically.
export const BRAND = {
  companyName: 'LOYALTY AUTOMATION PVT LTD', // big title in the centre of the header
  logoText: 'LOYALTY AUTOMATION', // red text next to the badge (used only when logo.png is missing)
  logoInitials: 'LA',
  tagline: 'We Make It, So You Succeed',
  logoUrl: '/logo.png',
  appTitle: 'Enterprise CRM',
  // Printed on the Proforma Invoice form and its PDF
  legalName: 'LOYALTY AUTOMATION PVT.LTD.',
  address: 'No. 27/1,Vaigai Colony 2nd Street, 12th Avenue Ashok Nagar,Ch-83.',
  phone: '044 43838063, 9551687011',
  email: 'loyaltyautomation@gmail.com',
  gstin: '33AACCL4592K1ZA',
  // invoice footer
  footerPhone: '044 43838063,+91 9840129532',
  footerEmails: 'info@loyaltyautomation.com, loyaltyautomation@gmail.com loyaltyapisales21@gmail.com, loyaltyautomation@gmail.com',
  website: 'www.loyaltyautomation.com',
  regdOffice: 'No. 27/1, Vaigai Colony 2nd Street, 12th Avenue Ashok Nagar, Chennai - 600 083',
  // Put these images in client/public to show them on the invoice (left out when missing)
  invoiceLogoUrl: '/invoice-logo.png', // LA mark in the invoice letterhead
  stampUrl: '/stamp.png', // company seal above "Authorised Signatory"
  partnerLogos: ['/brands/delta.png', '/brands/schneider.png', '/brands/phoenix-contact.png', '/brands/motovario.png'],
  state: 'Tamil Nadu - 33', // default consignee state on new invoices
  jurisdiction: 'Chennai',
};

// Button colour themes, matching the pastel quick-action buttons.
export const TONES = {
  indigo: { bg: '#e0e7ff', border: '#c7d2fe', text: '#3730a3' },
  blue: { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
  purple: { bg: '#faf5ff', border: '#e9d5ff', text: '#7e22ce' },
  green: { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d' },
  red: { bg: '#fef2f2', border: '#fecaca', text: '#be123c' },
  cyan: { bg: '#ecfeff', border: '#a5f3fc', text: '#0e7490' },
  sky: { bg: '#f0f9ff', border: '#bae6fd', text: '#0369a1' },
  violet: { bg: '#faf5ff', border: '#e9d5ff', text: '#6d28d9' },
  emerald: { bg: '#f0fdfa', border: '#a7f3d0', text: '#047857' },
  amber: { bg: '#fefce8', border: '#fde68a', text: '#b45309' },
  pink: { bg: '#fdf2f8', border: '#fbcfe8', text: '#be185d' },
  rose: { bg: '#fdf2f8', border: '#fbcfe8', text: '#be123c' },
  orange: { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c' },
  lavender: { bg: '#f5f3ff', border: '#ddd6fe', text: '#6d28d9' },
};

// Same order and colours as the original admin dashboard.
export const ADMIN_ACTIONS = [
  { label: 'Add Employee', tone: 'indigo', path: '/admin/register' },
  { label: 'Reset Employee Password', tone: 'purple', path: '/admin/resetPassword' }, // by Employee ID
  { label: "Today's Converted Customers", tone: 'green', to: 'leads?today=converted' },
  { label: "Today's Not Converted", tone: 'red', to: 'leads?today=notConverted' },
  { label: 'All Lead Enquiries', tone: 'cyan', to: 'leads' },
  { label: 'All Customers', tone: 'sky', to: 'customers' },
  { label: 'All Quotation Requests', tone: 'violet', to: 'quotationRequests' },
  { label: 'All PO Requests', tone: 'emerald', to: 'poRequests' },
  { label: 'All PI', tone: 'amber', to: 'pi' },
  { label: 'All Quotations', tone: 'blue', to: 'quotations' },
  { label: 'All Product Requests', tone: 'pink', to: 'productRequests' },
  { label: 'All Sales Orders', tone: 'rose', to: 'salesOrders' },
  { label: 'All Work Visits', tone: 'green', to: 'workVisits' },
  { label: 'All Service Details', tone: 'orange', to: 'serviceDetails' },
  { label: 'All Company Resources', tone: 'lavender', path: '/admin/companyResources' },
];

// Employee dashboards are built from the role's access (see access.js / server roles.js):
// one button per module, worded "My …" for own records and "All …" for team-wide access.
const ACTION_ORDER = [
  ['leads', 'Lead Enquiries'], ['customers', 'Customers'], ['quotationRequests', 'Quotation Requests'], ['poRequests', 'PO Requests'],
  ['pi', 'PI'], ['quotations', 'Quotations'], ['productRequests', 'Product Requests'], ['salesOrders', 'Sales Orders'],
  ['workVisits', 'Work Visits'], ['serviceDetails', 'Service Details'], ['inventory', 'Inventory'],
];
const TONE_CYCLE = ['cyan', 'sky', 'violet', 'emerald', 'amber', 'blue', 'pink', 'rose', 'green', 'orange', 'lavender'];
const ADD_LABEL = { leads: 'Add Lead Enquiry', workVisits: 'Add Work Visit', serviceDetails: 'Add Service Details', productRequests: 'Add Product Request', quotationRequests: 'Add Quotation Request', inventory: 'Add Stock' };

export function employeeActions(access) {
  if (!access) return [];
  const actions = [];
  // quick "Add …" buttons first, like the admin's Add Employee
  ['leads', 'workVisits', 'serviceDetails', 'productRequests', 'inventory'].forEach((k, i) => {
    if (['own', 'all', 'manage'].includes(access[k])) actions.push({ label: ADD_LABEL[k], tone: ['indigo', 'blue', 'purple', 'pink', 'emerald'][i], to: `${k}?new=1` });
  });
  if (access.leads) {
    actions.push({ label: "Today's Converted Customers", tone: 'green', to: 'leads?today=converted' });
    actions.push({ label: "Today's Not Converted", tone: 'red', to: 'leads?today=notConverted' });
  }
  ACTION_ORDER.forEach(([k, label], i) => {
    const lvl = access[k];
    if (!lvl) return;
    const prefix = lvl === 'own' ? 'My ' : lvl === 'read' ? '' : 'All ';
    actions.push({ label: `${prefix}${label}`, tone: TONE_CYCLE[i % TONE_CYCLE.length], to: k });
  });
  actions.push({ label: 'My Company Resources', tone: 'lavender', path: '/employee/companyResources' });
  return actions;
}

export const STATUS_TONE = {
  'New Lead': 'red', Assigned: 'sky', Quoted: 'amber', 'Closed: Won': 'green', 'Closed: Lost': 'rose',
  New: 'blue', 'Follow Up': 'amber', Converted: 'green', 'Not Converted': 'red',
  Pending: 'amber', 'In Progress': 'blue', Approved: 'green', Rejected: 'red',
  Confirmed: 'blue', Dispatched: 'violet', Delivered: 'green', Cancelled: 'red',
  Draft: 'lavender', Sent: 'blue', Paid: 'green', Accepted: 'green',
  Open: 'orange', Resolved: 'green', Closed: 'sky', Planned: 'blue', Completed: 'green',
  POreq: 'lavender', quotsaccess: 'indigo', 'products-status': 'blue', provided: 'green', returned: 'sky', lost: 'red',
};
