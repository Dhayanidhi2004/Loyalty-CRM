// Bell icon in the header: GET /api/notifications/count, GET /api/notifications?limit=, POST /:id/read, POST /read-all.
// Everyone only ever sees and changes their own notifications.
const router = require('express').Router();
const { one, many, query } = require('../db');
const { requireAuth } = require('../auth');
const { ah } = require('../utils');

router.use(requireAuth);
const unread = async (userId) => (await one('select count(*)::int as n from crm_notifications where user_id = $1 and read_at is null', [userId])).n;

router.get('/count', ah(async (req, res) => res.json({ unread: await unread(req.user.id) })));

router.get('/', ah(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const rows = await many(
    'select id, kind, title, body, ref, read_at, created_at from crm_notifications where user_id = $1 order by created_at desc, id desc limit $2',
    [req.user.id, limit]
  );
  res.json({
    unread: await unread(req.user.id),
    items: rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, ref: r.ref, read: !!r.read_at, createdAt: r.created_at })),
  });
}));

router.post('/read-all', ah(async (req, res) => {
  await query('update crm_notifications set read_at = now() where user_id = $1 and read_at is null', [req.user.id]);
  res.json({ unread: 0 });
}));

router.post('/:id/read', ah(async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ message: 'Notification not found' });
  const r = await query('update crm_notifications set read_at = coalesce(read_at, now()) where id = $1 and user_id = $2', [Number(req.params.id), req.user.id]);
  if (!r.rowCount) return res.status(404).json({ message: 'Notification not found' });
  res.json({ unread: await unread(req.user.id) });
}));

module.exports = router;
