// POST /api/inventory-import : reads products out of uploaded Excel / CSV sheets. Nothing is saved here; the screen shows the rows
// for checking and then saves them through POST /api/records/inventory/bulk.
const router = require('express').Router();
const multer = require('multer');
const { requireAuth } = require('../auth');
const { levelFor, can } = require('../roles');
const { ah } = require('../utils');
const { extractProducts } = require('../inventoryImport');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 20 } });
const fileName = (n) => { const s = String(n || ''); const f = Buffer.from(s, 'latin1').toString('utf8'); return f.includes('�') ? s : f; };

router.post('/', requireAuth, (req, res, next) => {
  if (!can.create(levelFor(req.user, 'inventory'))) return res.status(403).json({ message: "Your role can't add inventory" });
  next();
}, upload.array('files', 20), ah(async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ message: 'No file received' });
  res.json({ results: files.map((f) => extractProducts({ ...f, originalname: fileName(f.originalname) })) });
}));

module.exports = router;
