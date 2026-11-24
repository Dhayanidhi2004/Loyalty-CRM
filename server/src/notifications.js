// In-app notifications behind the bell icon in the header.
// One row per person per event (crm_notifications); the bell shows how many are still unread.
//
// kind tells the screen where clicking a notification goes (client/src/components/NotificationBell.jsx):
//   lead | emailLead | quotation | quotationRequest | productRequest | poRequest | inventory
const { query: poolQuery } = require('./db');

const run = (db, text, params) => (db ? db.query(text, params) : poolQuery(text, params));
const ids = (rows) => rows.map((r) => Number(r.id));

async function admins(db) {
  return ids((await run(db, "select id from crm_users where active and role = 'admin'")).rows);
}

// active employees whose login role is one of `roles` (e.g. ['Sales Head'])
async function withRoles(db, roles) {
  if (!roles.length) return [];
  return ids((await run(db, "select id from crm_users where active and role = 'employee' and designation = any($1::text[])", [roles])).rows);
}

// notifyUsers(db, [userIds], { kind, title, body, ref }, exceptUserId)
async function notifyUsers(db, userIds, n, except) {
  const to = [...new Set(userIds.filter((x) => x !== null && x !== undefined && /^\d+$/.test(String(x))).map(Number))]
    .filter((id) => id !== Number(except));
  if (!to.length) return 0;
  await run(
    db,
    `insert into crm_notifications (user_id, kind, title, body, ref)
     select u, $2, $3, $4, $5 from unnest($1::bigint[]) as u
     where exists (select 1 from crm_users where id = u and active)`,
    [to, n.kind, String(n.title || '').slice(0, 200), n.body ? String(n.body).slice(0, 500) : null, n.ref === undefined || n.ref === null ? null : String(n.ref)]
  );
  return to.length;
}

// Who hears about each kind of record being added (besides admins).
const WATCHERS = {
  quotations: ['Sales Head'],
  quotationRequests: ['Sales Head'],
  productRequests: ['Inventory Manager'],
  poRequests: ['Inventory Manager'],
};

const one = (d, ...keys) => keys.map((k) => d?.[k]).find((v) => v !== null && v !== undefined && v !== '') || '';

// A new record was added through the CRM screens.
async function recordCreated(db, moduleKey, data, actorId, actorName) {
  const by = actorName ? ` by ${actorName}` : '';
  if (moduleKey === 'leads') {
    const heads = data.salesHead ? [data.salesHead] : await withRoles(db, ['Sales Head']);
    const service = data.category === 'Service' ? await withRoles(db, ['Service Engineer']) : [];
    await notifyUsers(db, [...(await admins(db)), ...heads, ...service], {
      kind: 'lead',
      title: `New enquiry ${data.enqNo || ''}`.trim(),
      body: [data.companyName, data.customerName, data.source].filter(Boolean).join(' · ') + by,
      ref: data.enqNo,
    }, actorId);
    if (data.assignedTo) await leadAssigned(db, data, actorId);
    return;
  }
  const roles = WATCHERS[moduleKey];
  if (!roles) return;
  const text = {
    quotations: [`New quotation ${one(data, 'referenceNo', 'enquiryNo')}`, one(data, 'customerName')],
    quotationRequests: ['New quotation request', [one(data, 'customerName', 'companyName'), one(data, 'product')].filter(Boolean).join(' · ')],
    productRequests: ['New product request', one(data, 'company')],
    poRequests: [`New purchase order ${one(data, 'docNumber')}`, one(data, 'companyName')],
  }[moduleKey];
  await notifyUsers(db, [...(await admins(db)), ...(await withRoles(db, roles))], {
    kind: moduleKey === 'quotations' ? 'quotation' : moduleKey.replace(/s$/, ''),
    title: text[0].trim(),
    body: [text[1], by.trim()].filter(Boolean).join(' · '),
  }, actorId);
}

async function leadAssigned(db, lead, actorId) {
  await notifyUsers(db, [lead.assignedTo], {
    kind: 'lead',
    title: `Enquiry ${lead.enqNo || ''} assigned to you`.replace('  ', ' '),
    body: [lead.companyName, lead.customerName, lead.phone].filter(Boolean).join(' · '),
    ref: lead.enqNo,
  }, actorId);
}

// The person who entered an enquiry hears when it moves to another stage.
async function leadStageChanged(db, lead, createdBy, status, actorId) {
  await notifyUsers(db, [createdBy], {
    kind: 'lead',
    title: `Enquiry ${lead.enqNo || ''} is now ${status}`,
    body: [lead.companyName, lead.customerName].filter(Boolean).join(' · '),
    ref: lead.enqNo,
  }, actorId);
}

const isLow = (d) => d && (Number(d.current) || 0) <= (Number(d.minStock) || 0);

// rows: [{ data, before? }] -> one notification listing the products that just went to / below minimum stock
async function notifyLowStock(db, rows, actorId) {
  const low = rows.filter((r) => isLow(r.data) && !(r.before && isLow(r.before)));
  if (!low.length) return;
  const names = low.slice(0, 5).map((r) => r.data.itemCode).filter(Boolean).join(', ');
  await notifyUsers(db, [...(await admins(db)), ...(await withRoles(db, ['Inventory Manager', 'Stock Filler']))], {
    kind: 'inventory',
    title: low.length === 1 ? `Low stock: ${low[0].data.itemCode}` : `${low.length} products at or below minimum stock`,
    body: low.length === 1 ? `Current ${Number(low[0].data.current) || 0}, minimum ${Number(low[0].data.minStock) || 0}` : `${names}${low.length > 5 ? ` and ${low.length - 5} more` : ''}`,
  }, actorId);
}

module.exports = { notifyUsers, admins, withRoles, recordCreated, leadAssigned, leadStageChanged, notifyLowStock };
