// Reads products out of an uploaded Excel / CSV sheet for Inventory > Upload Excel.
// Only the inventory fields the CRM keeps are picked out (Item Code, Model, Brand, Description, Price,
// Inward, Outward, Min. Stock, Storage Location); every other column in the sheet is ignored.
// Nothing is saved here: the screen shows the rows for checking, then saves through POST /api/records/inventory/bulk.
const path = require('path');

const SHEET_EXT = new Set(['.xlsx', '.xls', '.xlsm', '.csv', '.tsv']);

// normalised header (lower case, letters and digits only) -> inventory field. First match wins per field.
const HEADERS = {
  itemCode: ['itemcode', 'itemno', 'itemnumber', 'code', 'productcode', 'partno', 'partnumber', 'partcode', 'sku', 'materialcode', 'materialno', 'catalogueno', 'catalogno', 'catno', 'articleno', 'articlecode', 'ordercode', 'orderno', 'refno', 'productid', 'itemid'],
  model: ['model', 'modelno', 'modelnumber', 'modelname', 'type', 'typeno', 'variant'],
  brand: ['brand', 'make', 'manufacturer', 'mfr', 'company', 'oem', 'brandname'],
  description: ['description', 'itemdescription', 'productdescription', 'itemname', 'productname', 'product', 'item', 'name', 'particulars', 'details', 'specification', 'unitdescription', 'materialdescription'],
  price: ['price', 'unitprice', 'rate', 'unitrate', 'mrp', 'listprice', 'lp', 'sellingprice', 'cost', 'unitcost', 'priceinr', 'pricers', 'amount'],
  inward: ['inward', 'inwardqty', 'qty', 'quantity', 'stock', 'openingstock', 'stockqty', 'available', 'availableqty', 'onhand', 'qtyonhand', 'instock', 'received', 'receivedqty', 'nos', 'units'],
  outward: ['outward', 'outwardqty', 'issued', 'issuedqty', 'sold', 'soldqty', 'dispatched', 'consumed'],
  minStock: ['minstock', 'minimumstock', 'minqty', 'minimumqty', 'reorderlevel', 'reorderqty', 'reorderpoint', 'safetystock', 'min'],
  location: ['location', 'storagelocation', 'store', 'bin', 'binlocation', 'rack', 'shelf', 'warehouse', 'godown'],
};
const NUMERIC = new Set(['price', 'inward', 'outward', 'minStock']);
// most specific first, so "Min Stock Level" becomes Min. Stock and not Inward
const CONTAINS_ORDER = ['minStock', 'outward', 'location', 'itemCode', 'model', 'brand', 'price', 'inward', 'description'];
// columns that are never product fields even though their names contain "code", "price", "qty" ...
const NOT_PRODUCT = /hsn|sac|gst|tax|pin|zip|postal|phone|mobile|total|serial|^sno|^slno|^sr/;
const FIELDS = Object.keys(HEADERS);

const norm = (k) => String(k ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

// "₹ 1,250.00" / "1250/-" / "12 Nos" -> number; '' when there is no number
function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : '';
  const s = clean(v).replace(/,/g, '');
  const m = /-?\d+(\.\d+)?/.exec(s);
  return m ? Number(m[0]) : '';
}

function headerMap(row) {
  const map = {};
  const keys = row.map(norm);
  // exact names first, then "contains" (e.g. "Unit Price (Rs)", "Item Code No.")
  for (const field of FIELDS) {
    const i = keys.findIndex((k, idx) => k && HEADERS[field].includes(k) && !Object.values(map).includes(idx));
    if (i >= 0) map[field] = i;
  }
  for (const field of CONTAINS_ORDER) {
    if (field in map) continue;
    const i = keys.findIndex((k, idx) => k && k.length <= 30 && !NOT_PRODUCT.test(k) && !Object.values(map).includes(idx) && HEADERS[field].some((h) => h.length >= 4 && k.includes(h)));
    if (i >= 0) map[field] = i;
  }
  return map;
}

// rows of one sheet -> products
function fromRows(rows) {
  // header = first row (within the first 15) that names at least two inventory fields, including a code / model / description
  let headIdx = -1;
  let map = null;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const m = headerMap(rows[i]);
    if (Object.keys(m).length >= 2 && ('itemCode' in m || 'model' in m || 'description' in m)) { headIdx = i; map = m; break; }
  }
  if (headIdx < 0) return { products: [], columns: [] };
  const products = [];
  for (const r of rows.slice(headIdx + 1)) {
    const p = {};
    for (const [field, i] of Object.entries(map)) p[field] = NUMERIC.has(field) ? toNumber(r[i]) : clean(r[i]);
    if (!p.itemCode && p.model) p.itemCode = p.model; // many price lists only have a model / part number
    if (!FIELDS.some((f) => p[f] !== undefined && p[f] !== '')) continue; // empty line
    if (!p.itemCode && !p.description) continue; // totals / notes lines
    if (/^(total|grand total|sub ?total)$/i.test(p.description || '') && !p.itemCode) continue;
    products.push(Object.fromEntries(FIELDS.map((f) => [f, p[f] ?? ''])));
  }
  return { products, columns: Object.keys(map) };
}

function fromSheet(buffer) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const out = [];
  const columns = new Set();
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true });
    const r = fromRows(rows);
    out.push(...r.products);
    r.columns.forEach((c) => columns.add(c));
  }
  return { products: out.slice(0, 20000), columns: [...columns] };
}

// -> { file, products: [...], columns: [...fields found], notes: [...] }
function extractProducts(f) {
  const ext = path.extname(f.originalname || '').toLowerCase();
  const result = { file: f.originalname, products: [], columns: [], notes: [] };
  if (!SHEET_EXT.has(ext)) {
    result.notes.push(`Unsupported file type ${ext || '(none)'}. Upload an Excel (.xlsx / .xls) or CSV file.`);
    return result;
  }
  try {
    const r = fromSheet(f.buffer);
    result.products = r.products;
    result.columns = r.columns;
    if (!r.products.length) result.notes.push('No product rows found. The sheet needs a header row with at least Item Code (or Part No / Model) and one more column such as Price or Qty.');
  } catch (e) {
    result.notes.push(`Could not read this file: ${e.message}`);
  }
  return result;
}

module.exports = { extractProducts, fromRows, FIELDS };
