// Project Quotations page: GET / POST / PUT / DELETE /api/project-quotations
// Access follows the "quotations" level of each login (roles.js): read to look, create/edit to save, delete for Sales Head + Admin.
// Every field is cleaned on the way in: text trimmed and length-limited, numbers never negative, NUL characters and broken
// emoji halves removed (the database refuses them), at most 300 line items.
const router = require('express').Router();
const { one, many, query } = require('../db');
const { requireAuth } = require('../auth');
const { levelFor, can } = require('../roles');
const { ah } = require('../utils');

router.use(requireAuth);
router.param('id', (_req, res, next, id) => (/^\d+$/.test(id) ? next() : res.status(404).json({ message: 'Quotation not found' })));
const level = (req) => levelFor(req.user, 'quotations');

const TEXT = ['ref', 'date', 'cust', 'proj', 'delivery', 'pay', 'valid', 'warr'];
const LONG = { addr: 600, note: 600, kind: 600, bank: 800, co: 120, coAddr: 300, coContact: 300, gstin: 40, hsn: 12, uom: 20, disc: 200, bomLabel: 40, thanks: 300, support: 300 };
const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function safe(v, max, keepLines) {
  let s = String(v ?? '').replace(/\u0000/g, '').replace(LONE, '');
  if (keepLines) s = s.replace(/\r/g, '');
  s = s.trim();
  if (s.length > max) {
    s = s.slice(0, max);
    if (/[\uD800-\uDBFF]$/.test(s)) s = s.slice(0, -1); // never cut an emoji in half
  }
  return s;
}
const num = (v, fallback = 0) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : fallback; };

function clean(b) {
  b = b && typeof b === 'object' ? b : {};
  const d = {};
  for (const k of TEXT) d[k] = safe(b[k], 300);
  for (const [k, max] of Object.entries(LONG)) if (b[k] !== undefined) d[k] = safe(b[k], max, true);
  d.price = num(b.price);
  d.gst = num(b.gst);
  if (b.qty !== undefined) d.qty = num(b.qty, 1);
  d.items = (Array.isArray(b.items) ? b.items : []).slice(0, 300)
    .map((i) => ({ d: safe(i?.d, 300), q: num(i?.q), u: safe(i?.u ?? 'Nos', 20) || 'Nos', h: safe(i?.h ?? '8536', 12) }))
    .filter((i) => i.d);
  return d;
}
const shape = (r) => ({ ...r.data, id: r.id, updatedAt: r.updated_at });

router.get('/', ah(async (req, res) => {
  if (!can.read(level(req))) return res.status(403).json({ message: "Your role doesn't have access to Project Quotations" });
  const rows = await many('select id, data, updated_at from crm_project_quotations order by id');
  res.json({ items: rows.map(shape) });
}));

router.post('/', ah(async (req, res) => {
  if (!can.create(level(req))) return res.status(403).json({ message: "Your role can't add project quotations" });
  const d = clean(req.body);
  if (!d.cust) return res.status(400).json({ message: 'Customer name is required' });
  const row = await one('insert into crm_project_quotations (data) values ($1) returning id, data, updated_at', [JSON.stringify(d)]);
  res.status(201).json(shape(row));
}));

router.put('/:id', ah(async (req, res) => {
  if (!can.create(level(req))) return res.status(403).json({ message: "Your role can't edit project quotations" });
  const d = clean(req.body);
  if (!d.cust) return res.status(400).json({ message: 'Customer name is required' });
  const row = await one('update crm_project_quotations set data = $1, updated_at = now() where id = $2 returning id, data, updated_at', [JSON.stringify(d), Number(req.params.id)]);
  if (!row) return res.status(404).json({ message: 'Quotation not found' });
  res.json(shape(row));
}));

router.delete('/:id', ah(async (req, res) => {
  if (!can.delete(level(req))) return res.status(403).json({ message: "Your role can't delete project quotations" });
  const r = await query('delete from crm_project_quotations where id = $1', [Number(req.params.id)]);
  if (!r.rowCount) return res.status(404).json({ message: 'Quotation not found' });
  res.json({ message: 'Quotation deleted' });
}));

module.exports = router;
