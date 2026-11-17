// POST /api/customer-extract : reads customer details out of uploaded PDF / Excel / CSV / JSON / image files.
// Nothing is saved here. The "Add Customers from Documents" screen shows the result for checking and then
// saves it through POST /api/records/customers/bulk.
const router = require('express').Router();
const multer = require('multer');
const { requireAuth } = require('../auth');
const { levelFor, can } = require('../roles');
const { ah } = require('../utils');
const { extractFromFile } = require('../customerExtract');

const MAX_FILES = 20;
const MAX_MB = 25; // same limits as the screen (components/CustomerAdd.jsx)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MB * 1024 * 1024, files: MAX_FILES } });

// multer reads file names as latin1; restore UTF-8 names (Tamil etc.)
const fileName = (n) => {
  const s = String(n || '');
  const fixed = Buffer.from(s, 'latin1').toString('utf8');
  return fixed.includes('�') ? s : fixed;
};

router.post('/', requireAuth, (req, res, next) => {
  if (!can.create(levelFor(req.user, 'customers'))) return res.status(403).json({ message: "Your role can't add customers" });
  next();
}, upload.array('files', MAX_FILES), ah(async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ message: 'No file received' });
  const results = [];
  for (const f of files) { // one at a time: scanned pages are read with OCR, which is heavy
    results.push(await extractFromFile({ ...f, originalname: fileName(f.originalname) }));
  }
  res.json({ results });
}));

module.exports = router;
