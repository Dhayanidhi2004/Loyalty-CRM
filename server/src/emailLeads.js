// Email Lead Intelligence: turns an inbox message into a possible sales enquiry.
// Pure functions (no I/O) so they are easy to test and tune. Adjust the word lists below
// to match how your customers write.

// Words that usually mean "someone wants to buy something or get something serviced".
const STRONG = [
  'quotation', 'quote', 'rfq', 'enquiry', 'inquiry', 'request for', 'price list', 'pricing', 'best price',
  'purchase order', 'requirement', 'we need', 'we require', 'looking for', 'interested in', 'kindly send', 'please send',
];
const MEDIUM = [
  'price', 'rate', 'cost', 'order', 'buy', 'purchase', 'supply', 'supplier', 'demo', 'catalogue', 'catalog',
  'brochure', 'specification', 'specs', 'availability', 'delivery', 'service', 'repair', 'maintenance', 'amc',
  'installation', 'breakdown', 'calibration', 'spare', 'spares', 'units', 'qty', 'quantity', 'nos',
];
const SERVICE_WORDS = ['service', 'repair', 'maintenance', 'amc', 'breakdown', 'calibration', 'installation', 'not working', 'complaint'];
const URGENT_WORDS = ['urgent', 'urgently', 'asap', 'immediately', 'at the earliest', 'today itself', 'priority'];

// Automated mail that is never a lead.
const AUTOMATED_SENDER = /(no-?reply|do-?not-?reply|mailer-daemon|notifications?@|alerts?@|newsletter|updates@|bounce)/i;
const NOISE = [
  ['unsubscribe', 3], ['newsletter', 2], ['webinar', 2], ['otp', 5], ['verification code', 5], ['one-time password', 5],
  ['password reset', 5], ['reset your password', 5], ['sign-in', 3], ['security alert', 5], ['has been shipped', 4],
  ['order confirmation', 3], ['your order', 2], ['payment received', 3], ['receipt for', 3], ['statement', 2],
];
const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.in', 'outlook.com', 'hotmail.com', 'live.com',
  'rediffmail.com', 'icloud.com', 'me.com', 'aol.com', 'protonmail.com', 'proton.me', 'zoho.com', 'zohomail.in', 'ymail.com',
]);
const CITIES = [
  'Chennai', 'Bengaluru', 'Bangalore', 'Mumbai', 'New Delhi', 'Delhi', 'Hyderabad', 'Pune', 'Kolkata', 'Ahmedabad',
  'Coimbatore', 'Madurai', 'Trichy', 'Tiruchirappalli', 'Salem', 'Tiruppur', 'Hosur', 'Vellore', 'Erode', 'Kochi',
  'Thiruvananthapuram', 'Mysuru', 'Mysore', 'Surat', 'Vadodara', 'Rajkot', 'Jaipur', 'Lucknow', 'Noida', 'Gurugram',
  'Gurgaon', 'Chandigarh', 'Ludhiana', 'Indore', 'Bhopal', 'Nagpur', 'Nashik', 'Aurangabad', 'Visakhapatnam',
  'Vijayawada', 'Bhubaneswar', 'Patna', 'Ranchi', 'Guwahati', 'Kanpur', 'Faridabad', 'Puducherry', 'Mangaluru', 'Belagavi',
];
const COMPANY_SUFFIX = /\b(pvt\.?\s*ltd\.?|private\s+limited|limited|ltd\.?|llp|inc\.?|corporation|corp\.?|industries|enterprises|technologies|solutions|engineering|engineers|systems|traders|trading|exports|manufacturing|manufacturers|automation|automobiles|textiles|pharma|hospital|labs?)\b/i;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (text, w) => new RegExp(`(^|[^a-z])${escapeRe(w)}([^a-z]|$)`, 'i').test(text);

// "Ravi Kumar <ravi@sripumps.in>" -> { name, email }
function parseFrom(from = '') {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() };
  const email = (from.match(/[^\s<>"]+@[^\s<>"]+/) || [null])[0];
  return { name: null, email: email ? email.toLowerCase() : null };
}

// Indian mobile numbers (+91 98400 12345, 098400-12345, 9840012345) and landlines with an STD code.
function findPhone(text) {
  const mobile = /(?<![\d+])(?:\+?91[\s-]?|0)?([6-9]\d{4})[\s-]?(\d{5})(?!\d)/.exec(text);
  if (mobile) return `+91 ${mobile[1]} ${mobile[2]}`;
  const land = /(?<![\d+])(0\d{2,4})[\s-](\d{2,4})[\s-]?(\d{4})(?!\d)/.exec(text);
  return land ? `${land[1]}-${land[2]}${land[3]}` : null;
}

function findCompany(body, fromEmail) {
  // signature block: look at the last lines for something like "Sri Pumps Pvt Ltd"
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(-15);
  for (const line of lines) {
    if (line.length > 70 || /^(dear|hi|hello|thanks|regards)/i.test(line)) continue;
    if (COMPANY_SUFFIX.test(line)) return line.replace(/^(for|from|m\/s\.?)\s+/i, '').replace(/[,.;:]+$/, '');
  }
  const domain = (fromEmail || '').split('@')[1];
  if (domain && !FREE_MAIL.has(domain)) {
    const name = domain.split('.')[0].replace(/[-_]+/g, ' ');
    return name.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return null;
}

const findCity = (text) => CITIES.find((c) => hasWord(text, c)) || null;

// Drop quoted replies ("> ..." and everything after "On ... wrote:") so old threads don't score.
function stripQuoted(body = '') {
  const cut = body.search(/^On .{4,120}wrote:\s*$/m);
  const text = cut > 0 ? body.slice(0, cut) : body;
  return text.split(/\r?\n/).filter((l) => !l.startsWith('>')).join('\n');
}

const htmlToText = (html = '') =>
  html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();

const b64url = (data = '') => Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

// Gmail API message (format=full) -> plain object
function messageFromGmail(msg) {
  const headers = Object.fromEntries((msg.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value]));
  let plain = null;
  let html = null;
  const walk = (part) => {
    if (!part) return;
    if (part.mimeType === 'text/plain' && part.body?.data && plain === null) plain = b64url(part.body.data);
    else if (part.mimeType === 'text/html' && part.body?.data && html === null) html = b64url(part.body.data);
    (part.parts || []).forEach(walk);
  };
  walk(msg.payload);
  const from = parseFrom(headers.from);
  return {
    id: msg.id,
    threadId: msg.threadId,
    fromName: from.name,
    fromEmail: from.email,
    subject: headers.subject || '(no subject)',
    snippet: msg.snippet || '',
    body: plain ?? htmlToText(html || '') ?? '',
    listUnsubscribe: !!headers['list-unsubscribe'],
    receivedAt: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : null,
  };
}

const MIN_SCORE = 4;

// Score one message. Returns the prefill for the enquiry form plus why it scored.
function extractLead(m) {
  const body = stripQuoted(m.body || '').slice(0, 8000);
  const text = `${m.subject || ''}\n${body}`;
  const reasons = [];
  let score = 0;

  const strong = STRONG.filter((w) => hasWord(text, w));
  const medium = MEDIUM.filter((w) => hasWord(text, w));
  score += strong.length * 3 + Math.min(medium.length, 4) * 1.5;
  [...strong, ...medium].slice(0, 6).forEach((w) => reasons.push(`mentions “${w}”`));

  const phone = findPhone(body);
  const company = findCompany(body, m.fromEmail);
  const domain = (m.fromEmail || '').split('@')[1];
  if (phone) { score += 1; reasons.push('phone number'); }
  if (company) { score += 1; reasons.push('company name'); }
  if (domain && !FREE_MAIL.has(domain)) { score += 1; reasons.push('business email'); }

  // automated / bulk mail
  let penalty = 0;
  if (AUTOMATED_SENDER.test(m.fromEmail || '')) penalty += 6;
  if (m.listUnsubscribe) penalty += 3;
  for (const [w, p] of NOISE) if (hasWord(text, w)) penalty += p;
  score -= penalty;

  score = Math.max(0, Math.round(score));
  const urgent = URGENT_WORDS.some((w) => hasWord(text, w));
  const priority = urgent ? 'Hot' : score >= 10 ? 'High' : score >= 7 ? 'Warm' : 'Low';
  const category = SERVICE_WORDS.some((w) => hasWord(text, w)) ? 'Service' : 'Product';
  if (urgent) reasons.unshift('urgent');

  const contactName = m.fromName || (m.fromEmail ? m.fromEmail.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : null);

  return {
    isLead: score >= MIN_SCORE,
    score: Math.min(score, 99),
    reasons: reasons.slice(0, 8),
    phone,
    company,
    city: findCity(text),
    category,
    priority,
    contactName,
    body: body.trim().slice(0, 4000),
  };
}

module.exports = { extractLead, messageFromGmail, parseFrom, findPhone, findCompany, htmlToText, MIN_SCORE };
