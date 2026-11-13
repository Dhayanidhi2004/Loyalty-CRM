// Reads customer details (company, GST, PAN, contact person, phone, email, address) out of
// uploaded PDF / Excel / CSV / JSON / image files. Nothing is saved here; the route returns the
// result and the screen lets the user check it before saving.
const path = require('path');
const { findPhone, findCompany, COMPANY_SUFFIX } = require('./emailLeads');

const GST_RE = /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/;
const PAN_RE = /\b[A-Z]{5}\d{4}[A-Z]\b/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.webp', '.tif', '.tiff', '.gif']);
const SHEET_EXT = new Set(['.xlsx', '.xls', '.xlsm', '.csv', '.tsv']);

// column header -> customer field (Excel / CSV)
const HEADERS = {
  companyName: /^(company|company name|customer|customer name|firm|organi[sz]ation|name of (the )?company)$/i,
  gst: /^(gst|gstin|gst no\.?|gst number|gstin\/uin)$/i,
  pan: /^(pan|pan no\.?|pan number)$/i,
  contactPerson: /^(contact person|contact|contact name|person|attention|attn)$/i,
  phone: /^(phone|mobile|phone no\.?|mobile no\.?|contact no\.?|contact number|tel)$/i,
  email: /^(email|e-?mail|email id|e-?mail address)$/i,
  address: /^(address|registered address|billing address|location)$/i,
};

const blank = () => ({ companyName: '', gst: '', pan: '', contactPerson: '', phone: '', email: '', address: '' });
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

// ---------- our own company: never taken as the customer ----------
// (our quotations / POs addressed to us contain our name, GSTIN, phone and email; set OWN_* in .env to change)
const OWN = {
  gstin: (process.env.OWN_GSTIN || '33AACCL4592K1ZA').toUpperCase(),
  // [l1i|] : OCR often reads the "l" of loyalty as i, 1 or |
  name: new RegExp(process.env.OWN_NAME_PATTERN || '[l1i|]oya[l1i|]ty\\s*automation', 'i'),
  email: new RegExp(process.env.OWN_EMAIL_PATTERN || '[l1i|]oya[l1i|]ty\\s*automation|[l1i|]oya[l1i|]tyapisa[l1i|]es', 'i'),
  phones: String(process.env.OWN_PHONES || '43838063,9551687011,9840129532').split(',').map((x) => x.replace(/\D/g, '')).filter(Boolean),
};
const digits = (s) => String(s || '').replace(/\D/g, '');

// ---------- GSTIN: format + check character, and repair of OCR slips ----------
const GST_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function gstCheckOk(g) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = GST_CHARS.indexOf(g[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return GST_CHARS[(36 - (sum % 36)) % 36] === g[14];
}
const GST_EXACT = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const TO_DIGIT = { O: '0', D: '0', Q: '0', I: '1', L: '1', '|': '1', S: '5', B: '8', Z: '2', G: '6' };
const TO_LETTER = { 0: 'O', 1: 'I', 5: 'S', 8: 'B', 2: 'Z', 6: 'G' };
function fixGstShape(t) {
  return [...t].map((ch, i) => {
    if ([0, 1, 7, 8, 9, 10].includes(i)) return TO_DIGIT[ch] || ch;
    if ([2, 3, 4, 5, 6, 11].includes(i)) return TO_LETTER[ch] || ch;
    if (i === 13) return ch === '2' ? 'Z' : ch;
    return ch;
  }).join('');
}
// GSTINs written next to a "GST" label in OCR text that the strict pattern missed (1Z27 instead of 1Z7, O for 0 ...).
function ocrGstins(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!/gst/i.test(line)) continue;
    const raw = line.toUpperCase().replace(/.*GST[A-Z/ ]*[:.\-]?/, '').replace(/[^0-9A-Z|]/g, '');
    // every way of reading 15 characters out of the first 15-17 (OCR adds a stray character now and then)
    const cands = new Set();
    for (let len = 15; len <= 17 && len <= raw.length; len++) {
      const tok = raw.slice(0, len);
      const extra = len - 15;
      if (!extra) cands.add(tok);
      else for (let i = 0; i < len; i++) {
        if (extra === 1) cands.add(tok.slice(0, i) + tok.slice(i + 1));
        else for (let j = i + 1; j < len; j++) cands.add([...tok].filter((_, k) => k !== i && k !== j).join(''));
      }
    }
    const shaped = [...new Set([...cands].map(fixGstShape))].filter((g) => GST_EXACT.test(g));
    // only a GSTIN whose check character is right is trusted; otherwise better blank than wrong
    const best = shaped.find(gstCheckOk);
    if (best) out.push(best);
  }
  return out;
}
const isOwnLine = (l) => OWN.name.test(l) || l.toUpperCase().includes(OWN.gstin) || OWN.email.test(l) || OWN.phones.some((p) => digits(l).includes(p));

const GST_ALL = new RegExp(GST_RE.source, 'g');
const EMAIL_ALL = new RegExp(EMAIL_RE.source, 'g');
const DESIGNATION = /\b(managing director|director|proprietor|partner|manager|engineer|executive|officer|head|ceo|cfo|coo|md|gm|owner|purchase|sales|accounts|founder)\b/i;
const LABEL_LINE = /^\s*(\d+\.\s*)?[A-Za-z][A-Za-z /&().,'-]{1,45}\s*:/; // "5. Date of Liability :", "GSTIN:"
const COMPANY_LABEL = /^(?:\d+\.\s*)?(?:legal name(?: of business)?|trade name(?:, if any)?|company name|name of (?:the )?(?:company|business|firm)|firm name|customer name|buyer|bill to|billed to|ship to|consignee|customer|party name|m\/s\.?)\s*[:\-]?\s*(.*)$/i;
const cleanCompany = (s) => clean(s).replace(/^(for|from|m\/s\.?|to,?)\s+/i, '').replace(/[,.;:]+$/, '').trim();
// "(Bill to)", "(Ship to)", "Details of Receiver" ... are labels, not names
const labelOnly = (s) => !clean(s).replace(/\([^)]*\)/g, '').replace(/^(details of )?(receiver|consignee|buyer|bill(ed)? to|ship(ped)? to)\b/i, '').replace(/[:\-\s]/g, '');
const validName = (s) => !!s && !labelOnly(s) && /[a-z]{2}/i.test(s) && !/^\(/.test(s) && !GST_RE.test(s.toUpperCase());

// Several customers in one PDF (a customer list / table): one row per line with its own GSTIN
function rowsFromText(lines) {
  const rows = lines.filter((l) => !isOwnLine(l) && (l.toUpperCase().match(GST_ALL) || []).length === 1);
  if (rows.length < 2) return [];
  return rows.map((l) => {
    const c = blank();
    c.gst = l.toUpperCase().match(GST_RE)[0];
    c.pan = c.gst.slice(2, 12);
    c.email = ((l.match(EMAIL_RE) || [''])[0] || '').toLowerCase();
    c.phone = findPhone(l) || '';
    const cells = l.split(/\s*\|\s*|\t|\s{2,}/).map(clean).filter(Boolean);
    const isData = (x) => GST_RE.test(x.toUpperCase()) || EMAIL_RE.test(x) || /^[+\d\s-]{8,}$/.test(x);
    const words = cells.filter((x) => !isData(x) && /[a-z]/i.test(x));
    c.companyName = cleanCompany(words.find((x) => COMPANY_SUFFIX.test(x)) || words[0] || '');
    c.contactPerson = words.find((x) => x !== words.find((y) => COMPANY_SUFFIX.test(y)) && x !== c.companyName && x.split(' ').length <= 4) || '';
    return c;
  }).filter((c) => c.companyName);
}

function fromText(raw, fileName = '') {
  const text = raw.replace(/\r/g, '');
  const all = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim());
  // drop our own address block after "To," on a customer's PO (To, / Loyalty Automation / address / GSTIN)
  const lines = [];
  for (let i = 0; i < all.length; i++) {
    if (/^to,?$/i.test(all[i]) && all[i + 1] && isOwnLine(all[i + 1])) {
      i += 1;
      while (i + 1 < all.length && all[i + 1] && !/^(please|kindly|dear|sub|ref)\b/i.test(all[i + 1]) && i < all.length) {
        if (!isOwnLine(all[i + 1]) && !/^(ashok nagar|chennai|no\.)/i.test(all[i + 1]) && !GST_RE.test(all[i + 1].toUpperCase())) break;
        i += 1;
      }
      continue;
    }
    lines.push(all[i]);
  }
  const theirs = lines.filter((l) => l && !isOwnLine(l));
  const theirText = theirs.join('\n');

  const many = rowsFromText(theirs);
  if (many.length) return many;

  const c = blank();
  const upper = theirText.toUpperCase();
  c.gst = (upper.match(GST_ALL) || []).find((g) => g !== OWN.gstin) || ocrGstins(theirText).find((g) => g !== OWN.gstin) || '';
  c.pan = c.gst ? c.gst.slice(2, 12) : (upper.match(PAN_RE) || [''])[0];
  c.email = ((theirText.match(EMAIL_ALL) || []).find((e) => !OWN.email.test(e)) || '').toLowerCase();
  c.phone = findPhone(theirText) || '';

  // value after a label, on the same line or the next line
  const afterLabel = (re) => {
    for (let i = 0; i < lines.length; i++) {
      const m = re.exec(lines[i]);
      if (!m) continue;
      const v = labelOnly(m[1] || '') ? '' : clean(m[1] || '');
      const next = lines.slice(i + 1).find((x) => x && !labelOnly(x));
      const val = v || (next && !LABEL_LINE.test(next) && !COMPANY_LABEL.test(next) ? next : '');
      if (val && !isOwnLine(val)) return { value: val, at: i };
    }
    return null;
  };

  // company: labelled (GST certificate, Consignee / Bill To / M/s) > letterhead at the top > "For X" signature > anything with Pvt Ltd > file name
  const labelled = afterLabel(COMPANY_LABEL);
  const top = theirs.slice(0, 6).find((l) => COMPANY_SUFFIX.test(l) && l.length <= 70 && !LABEL_LINE.test(l));
  const signed = theirs.slice().reverse().find((l) => /^for\s+/i.test(l) && COMPANY_SUFFIX.test(l));
  const anyLine = theirs.find((l) => COMPANY_SUFFIX.test(l) && l.length <= 70 && !LABEL_LINE.test(l) && !/^\d/.test(l));
  // The file name usually carries the company ("1108_AVO Carbon India Private Limited - Chennai.pdf"): use it first when it clearly
  // names a company (Pvt Ltd / Private Limited / Ltd / LLP ...), after dropping the number in front and the " - place" after it.
  const fromFile = (() => {
    const base = path.basename(String(fileName || ''), path.extname(String(fileName || '')))
      .replace(/[_]+/g, ' ').replace(/^[\d\s.#-]+/, '')
      .replace(/^(tax\s+)?(invoice|inv|bill|po|purchase order|quotation|quote|qt|offer|proforma|pi|dc|delivery challan|gst certificate|certificate|order)\b[\s.#:-]*(no\.?\s*)?[\d\s.#/-]*/i, '')
      .split(/\s+-\s+/)[0].trim();
    return validName(base) && COMPANY_SUFFIX.test(base) ? base : '';
  })();
  const STRONG = /\b(pvt|private|ltd|limited|llp|inc|corporation|corp|company)\b/i;
  const fromDoc = [labelled && labelled.value, top, signed, anyLine, findCompany(theirText, c.email)].map((x) => cleanCompany(x || '')).find(validName) || '';
  c.companyName = (fromFile && (STRONG.test(fromFile) || !fromDoc) ? cleanCompany(fromFile) : fromDoc) || cleanCompany(fromFile);

  // contact person
  const attn = afterLabel(/^(?:kind\s+)?(?:attn|attention|contact person|contact name|name of (?:the )?contact)\.?\s*[:\-]?\s*(.*)$/i);
  let contact = attn ? attn.value : '';
  if (!contact) {
    // visiting card: "R. Senthil Kumar - Managing Director"
    const card = theirs.find((l) => DESIGNATION.test(l) && !COMPANY_SUFFIX.test(l) && !/[@\d]/.test(l) && l.length <= 60);
    if (card) contact = card.split(/\s+[-–,|]\s+|\s*\(/)[0];
  }
  c.contactPerson = clean(contact).replace(/\s*\((purchase|sales|accounts)\)$/i, '').replace(/\s*[,\-–]\s*(purchase|sales|accounts|stores|maintenance|manager|engineer|director|head)\b.*$/i, '').replace(/^(mr|mrs|ms|dr)\.?\s*/i, (m) => m);
  if (c.contactPerson && (c.contactPerson === c.companyName || COMPANY_SUFFIX.test(c.contactPerson) || EMAIL_RE.test(c.contactPerson))) c.contactPerson = '';

  // address: labelled, or the lines under the company name in a Consignee / M/s block
  let address = '';
  const addrLabel = lines.findIndex((l) => /^(?:\d+\.\s*)?(?:address|registered address|billing address|address of principal place of business|principal place of business)\b/i.test(l));
  const take = (from, first) => {
    const out = first ? [first] : [];
    for (let i = from; i < lines.length && out.length < 3; i++) {
      const l = lines[i];
      if (!l || LABEL_LINE.test(l) || GST_RE.test(l.toUpperCase()) || EMAIL_RE.test(l) || isOwnLine(l) || /^(kind\s+)?attn|^mobile|^phone|^tel|^email/i.test(l)) break;
      out.push(l);
    }
    return out.join(', ').replace(/,\s*,/g, ',').replace(/,\s*$/, '');
  };
  if (addrLabel >= 0) {
    const first = clean(lines[addrLabel].split(/:\s*/).slice(1).join(': '));
    address = take(addrLabel + 1, first);
  } else if (labelled) {
    // the lines under the name in a Consignee / Bill To / M/s block (OCR may put blank lines in between)
    let nameLine = labelled.at;
    if (labelled.value !== clean((COMPANY_LABEL.exec(lines[labelled.at]) || [])[1] || '')) {
      nameLine = lines.findIndex((l, i) => i > labelled.at && l === labelled.value);
    }
    let from = nameLine + 1;
    while (from < lines.length && !lines[from]) from += 1;
    if (nameLine >= 0) address = take(from);
  }
  if (!address) {
    // letterhead / visiting card: the line with a 6-digit PIN code (plus the line before it when the company name sits above)
    const pinAt = theirs.findIndex((l) => /\b\d{3}\s?\d{3}\b/.test(l) && /[a-z]{3}/i.test(l) && !GST_RE.test(l.toUpperCase()) && !EMAIL_RE.test(l)
      && !/^(phone|mobile|tel|ph|cell|whatsapp|po no|date|gst)/i.test(l) && digits(l).length <= 10 && !findPhone(l) && l !== c.companyName);
    if (pinAt >= 0) {
      const prev = theirs[pinAt - 1];
      const prevOk = prev && prev !== c.companyName && cleanCompany(prev) !== c.companyName && !LABEL_LINE.test(prev) && !GST_RE.test(prev.toUpperCase()) && !EMAIL_RE.test(prev) && !DESIGNATION.test(prev) && /\d/.test(prev);
      address = prevOk ? `${prev}, ${theirs[pinAt]}` : theirs[pinAt];
    }
  }
  c.address = clean(address).replace(/,\s*$/, '').replace(/,\s*,/g, ',');
  for (const name of [c.companyName, labelled && labelled.value].filter(Boolean)) {
    if (c.address.toLowerCase().startsWith(name.toLowerCase())) c.address = c.address.slice(name.length).replace(/^[\s,]+/, '');
  }
  if (c.address && c.address.length < 6) c.address = '';
  return hasData(c) ? [c] : [];
}

const hasData = (c) => Object.values(c).some(Boolean);

function fromSheet(buffer) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const out = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
    const headIdx = rows.findIndex((r) => r.filter((x) => clean(x)).length >= 2);
    if (headIdx < 0) continue;
    const map = {};
    rows[headIdx].forEach((h, i) => {
      for (const [field, re] of Object.entries(HEADERS)) if (!(field in map) && re.test(clean(h))) map[field] = i;
    });
    if (!('companyName' in map)) continue;
    for (const r of rows.slice(headIdx + 1)) {
      const c = blank();
      for (const [field, i] of Object.entries(map)) c[field] = clean(r[i]);
      c.gst = c.gst.toUpperCase();
      c.pan = (c.pan || (c.gst ? c.gst.slice(2, 12) : '')).toUpperCase();
      c.email = c.email.toLowerCase();
      if (c.companyName) out.push(c);
    }
  }
  return out;
}


// ---------- JSON ----------
// Accepts a list of objects, or an object that holds the list ({ "customers": [...] }, { "data": { "items": [...] } }).
// Keys are matched loosely (company / Company Name / company_name / companyName / gstin / mobile ...), and
// everything that is not one of the 7 customer fields is dropped.
const norm = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
const KEYS = {
  companyName: ['companyname', 'company', 'customername', 'customer', 'firmname', 'firm', 'organization', 'organisation', 'organizationname', 'businessname', 'business', 'tradename', 'legalname', 'nameofcompany', 'nameofthecompany', 'name'],
  contactPerson: ['contactperson', 'contactname', 'contact', 'person', 'attention', 'attn', 'ownername', 'owner', 'contactpersonname'],
  gst: ['gst', 'gstin', 'gstno', 'gstnumber', 'gstinuin', 'gstidentificationnumber'],
  pan: ['pan', 'panno', 'pannumber', 'pancard'],
  phone: ['phone', 'mobile', 'phoneno', 'mobileno', 'phonenumber', 'mobilenumber', 'contactno', 'contactnumber', 'tel', 'telephone', 'cell', 'whatsapp'],
  email: ['email', 'emailid', 'emailaddress', 'mail', 'emailidofcustomer'],
  address: ['address', 'registeredaddress', 'billingaddress', 'fulladdress', 'officeaddress', 'location'],
};
const ADDRESS_PARTS = ['address1', 'addressline1', 'addr1', 'street', 'address2', 'addressline2', 'addr2', 'area', 'locality', 'city', 'town', 'district', 'state', 'pincode', 'pin', 'zip', 'zipcode', 'postalcode'];

const scalar = (v) => {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(scalar).filter(Boolean).join(', ');
  if (typeof v === 'object') return Object.values(v).map(scalar).filter(Boolean).join(', ');
  return clean(v);
};

// the list of customer objects inside any JSON shape
function jsonList(value, depth = 0) {
  if (Array.isArray(value)) return value.filter((x) => x && typeof x === 'object' && !Array.isArray(x));
  if (!value || typeof value !== 'object' || depth > 3) return [];
  const vals = Object.values(value);
  const lists = vals.filter(Array.isArray);
  if (lists.length) return lists.map((l) => jsonList(l, depth + 1)).sort((a, b) => b.length - a.length)[0];
  const nested = vals.map((v) => jsonList(v, depth + 1)).sort((a, b) => b.length - a.length)[0];
  if (nested && nested.length) return nested;
  // { "C1": {...}, "C2": {...} }
  const objs = vals.filter((v) => v && typeof v === 'object' && !Array.isArray(v));
  return objs.length ? objs : [value];
}

function customerFromObject(obj) {
  const flat = {}; // normalised key -> value (one level of nesting is flattened, top-level keys win)
  const put = (k, v) => { const n = norm(k); if (!(n in flat) && v !== null && v !== undefined && scalar(v) !== '') flat[n] = v; };
  Object.entries(obj).forEach(([k, v]) => put(k, v));
  Object.entries(obj).forEach(([k, v]) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.entries(v).forEach(([k2, v2]) => put(k2, v2));
  });
  // value of the first matching key; a nested object is not turned into text (its inner keys were already flattened above)
  const pick = (names) => {
    for (const n of names) {
      if (!(n in flat)) continue;
      const v = flat[n];
      if (v && typeof v === 'object' && !Array.isArray(v)) continue;
      return scalar(v);
    }
    return '';
  };

  const c = blank();
  c.companyName = pick(KEYS.companyName);
  const usedName = c.companyName && c.companyName === scalar(flat.name) && !KEYS.companyName.slice(0, -1).some((n) => n in flat);
  c.contactPerson = pick(KEYS.contactPerson);
  if (!c.contactPerson) { // "contact": { "name": "...", "phone": "..." }
    for (const n of KEYS.contactPerson) {
      const v = n in flat ? flat[n] : null;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const inner = Object.fromEntries(Object.entries(v).map(([k, x]) => [norm(k), x]));
        c.contactPerson = scalar(inner.name || inner.fullname || inner.contactperson || '');
        if (c.contactPerson) break;
      }
    }
  }
  if (!c.contactPerson && 'name' in flat && !usedName && typeof flat.name !== 'object') c.contactPerson = scalar(flat.name);
  c.gst = pick(KEYS.gst).toUpperCase();
  c.pan = (pick(KEYS.pan) || (c.gst ? c.gst.slice(2, 12) : '')).toUpperCase();
  c.phone = pick(KEYS.phone);
  c.email = pick(KEYS.email).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(c.email)) c.email = ''; // a wrong email must not cost you the customer
  c.address = pick(KEYS.address);
  if (!c.address && flat.address && typeof flat.address === 'object') c.address = scalar(flat.address);
  if (!c.address) c.address = ADDRESS_PARTS.filter((n) => n in flat).map((n) => scalar(flat[n])).filter(Boolean).join(', ');
  if (c.contactPerson && c.contactPerson === c.companyName) c.contactPerson = '';
  return c;
}

function fromJson(buffer) {
  let value;
  try {
    value = JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    throw new Error('This is not a valid JSON file');
  }
  return jsonList(value).slice(0, 20000).map(customerFromObject).filter((c) => c.companyName);
}

async function pdfText(buffer) {
  require('./pdfPolyfill'); // DOMMatrix etc. for pdf.js when the native canvas add-on is missing
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const res = await parser.getText();
    return res.text || '';
  } finally {
    await parser.destroy().catch(() => {});
  }
}

async function ocr(buffer) {
  const { createWorker } = require('tesseract.js');
  const worker = await createWorker('eng', 1, { langPath: path.dirname(require.resolve('@tesseract.js-data/eng/package.json')) + '/4.0.0', gzip: true, cacheMethod: 'none' }); // no 23 MB cache file in the project folder
  try {
    const { data } = await worker.recognize(buffer);
    return data.text || '';
  } finally {
    await worker.terminate();
  }
}

// -> { file, customers: [...], notes: [...] }
// Scanned PDFs are pictures of pages, usually stored as JPEG images inside the PDF. Pull those JPEGs out so OCR can read them
// (no PDF renderer needed). Returns up to `max` image buffers.
function scannedImages(buffer, max = 3) {
  const out = [];
  const bin = buffer.toString('latin1');
  let at = 0;
  while (out.length < max) {
    const f = bin.indexOf('/DCTDecode', at);
    if (f < 0) break;
    const st = bin.indexOf('stream', f);
    if (st < 0) break;
    let start = st + 6;
    if (bin[start] === '\r') start += 1;
    if (bin[start] === '\n') start += 1;
    const end = bin.indexOf('endstream', start);
    if (end < 0) break;
    const img = buffer.subarray(start, end);
    if (img[0] === 0xff && img[1] === 0xd8 && img.length > 2000) out.push(Buffer.from(img)); // JPEG, not a tiny logo
    at = end + 9;
  }
  return out;
}

async function extractFromFile(f) {
  const ext = path.extname(f.originalname || '').toLowerCase();
  const result = { file: f.originalname, customers: [], notes: [] };
  try {
    if (SHEET_EXT.has(ext)) {
      result.customers = fromSheet(f.buffer);
      if (!result.customers.length) result.notes.push('No sheet with a Company / Customer column was found.');
    } else if (ext === '.json') {
      result.customers = fromJson(f.buffer);
      if (!result.customers.length) result.notes.push('No customer list with a company / name field was found in this JSON.');
    } else if (ext === '.pdf') {
      let text = await pdfText(f.buffer);
      if (text.replace(/\s+/g, '').length < 20) {
        // scanned PDF: read the page images
        const pages = scannedImages(f.buffer);
        if (!pages.length) {
          result.notes.push('This PDF is a scan with no readable text. Upload a photo / JPG of the page instead.');
        } else {
          text = '';
          for (const img of pages) text += `\n${await ocr(img)}`;
          result.notes.push(`Scanned PDF: read ${pages.length} page image${pages.length === 1 ? '' : 's'} with OCR, please check the details.`);
        }
      }
      result.customers = fromText(text, f.originalname);
    } else if (IMAGE_EXT.has(ext)) {
      result.customers = fromText(await ocr(f.buffer), f.originalname);
      if (result.customers.length) result.notes.push('Read from a picture with OCR, please check the details.');
    } else {
      result.notes.push(`Unsupported file type ${ext || '(none)'}. Use PDF, Excel, CSV, JSON, JPG or PNG.`);
    }
    if (!result.customers.length && !result.notes.length) result.notes.push('No customer details found in this file.');
  } catch (e) {
    const msg = /password|encrypt/i.test(e.message) ? 'This PDF is password-protected. Remove the password and upload again.' : `Could not read this file: ${e.message}`;
    result.notes.push(msg);
  }
  return result;
}

module.exports = { extractFromFile, fromText };
