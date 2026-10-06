export function fmtDate(v) {
  if (!v) return '—';
  const s = String(v);
  // plain YYYY-MM-DD from a date field: don't let the timezone shift it
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
}

export function fmtDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  return `${fmtDate(v)} ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
}

export const fmtMoney = (v) =>
  v === null || v === undefined || v === '' ? '—' : `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function fmtValue(field, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (field.type === 'date') return fmtDate(v);
  if (field.type === 'currency') return fmtMoney(v);
  return String(v);
}

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || '?';

export function downloadCsv(filename, columns, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => esc(c.label)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => esc(c.get(r))).join(','));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Columns for a CSV export of a module: employee fields show the person's name, hidden/line-item fields are skipped.
export const csvColumns = (mod) =>
  mod.fields
    .filter((f) => !f.hidden && f.type !== 'items')
    .map((f) => ({
      label: f.label,
      get: (r) => (f.type === 'date' ? fmtDate(r[f.key]) : f.type === 'employee' ? r[`${f.key}Name`] ?? '' : r[f.key] ?? ''),
    }));

// 125430 -> "One Lakh Twenty Five Thousand Four Hundred Thirty Rupees Only" (Indian numbering)
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
  'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const upto99 = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const upto999 = (n) => [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : '', upto99(n % 100)].filter(Boolean).join(' ');
function intToWords(n) {
  if (n === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 1e7);
  if (crore) parts.push(`${intToWords(crore)} Crore`);
  const lakh = Math.floor((n % 1e7) / 1e5);
  if (lakh) parts.push(`${upto99(lakh)} Lakh`);
  const thousand = Math.floor((n % 1e5) / 1000);
  if (thousand) parts.push(`${upto99(thousand)} Thousand`);
  const rest = n % 1000;
  if (rest) parts.push(upto999(rest));
  return parts.join(' ');
}
export function amountInWords(amount) {
  const v = Math.round((Number(amount) || 0) * 100) / 100;
  const rupees = Math.floor(v);
  const paise = Math.round((v - rupees) * 100);
  return `${intToWords(rupees)} Rupees${paise ? ` and ${upto99(paise)} Paise` : ''} Only`;
}
