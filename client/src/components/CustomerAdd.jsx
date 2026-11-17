import { useMemo, useRef, useState } from 'react';
import { FileText, FileSpreadsheet, Image as ImageIcon, Plus, Trash2, Upload } from 'lucide-react';
import Modal from './Modal';
import { RecordFormModal } from './RecordModals';
import { api } from '../api';
import { useApp } from '../AppContext';

const ACCEPT = '.pdf,.xlsx,.xls,.xlsm,.csv,.tsv,.png,.jpg,.jpeg,.webp,.bmp,.gif,.tif,.tiff,.json';
const MAX_FILES = 20;
const MAX_MB = 25;
const SHOW_ROWS = 100; // big imports (2,000+ customers): only the first rows are drawn for editing; ALL rows are still added
const COLS = [
  ['companyName', 'Company *', 170], ['gst', 'GST', 150], ['pan', 'PAN', 110], ['contactPerson', 'Contact Person', 130],
  ['phone', 'Phone', 120], ['email', 'Email', 170], ['address', 'Address', 220],
];

const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
const fileIcon = (name) => (/\.(xlsx?|xlsm|csv|tsv)$/i.test(name) ? <FileSpreadsheet size={15} /> : /\.pdf$/i.test(name) ? <FileText size={15} /> : <ImageIcon size={15} />);

// Marks every row as ready, invalid or duplicate (against the saved customers and earlier rows).
function review(rows, existing) {
  const sig = (c) => [c.gst && `g:${c.gst}`, c.pan && `p:${c.pan}`, `n:${String(c.companyName || '').toLowerCase()}`].filter(Boolean);
  const seen = new Set();
  (existing || []).forEach((c) => sig({ ...c, gst: text(c.gst).toUpperCase(), pan: text(c.pan).toUpperCase() }).forEach((s) => seen.add(s)));
  return rows.map((r) => {
    const c = r.c;
    if (!text(c.companyName)) return { state: 'invalid', note: 'Company name missing' };
    if (c.email && !/^\S+@\S+\.\S+$/.test(c.email)) return { state: 'invalid', note: 'Email looks wrong' };
    const keys = c.gst || c.pan ? sig(c).filter((s) => !s.startsWith('n:')) : sig(c);
    if (keys.some((s) => seen.has(s))) return { state: 'duplicate', note: 'Already exists' };
    keys.forEach((s) => seen.add(s));
    return { state: 'ready', note: 'Ready' };
  });
}

function UploadModal({ existing, onClose, onDone }) {
  const { notify } = useApp();
  const fileRef = useRef(null);
  const [rows, setRows] = useState(null);     // [{ id, file, c }]
  const [notes, setNotes] = useState([]);     // [{ file, text }]
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState([]);
  const nextId = useRef(1);

  const checks = useMemo(() => review(rows || [], existing), [rows, existing]);
  const ready = (rows || []).filter((_, i) => checks[i]?.state === 'ready');
  const count = (s) => checks.filter((x) => x.state === s).length;

  async function read(fileList) {
    const files = Array.from(fileList || []);
    setError(''); setFailed([]);
    if (!files.length) return;
    if (files.length > MAX_FILES) return setError(`Choose at most ${MAX_FILES} files at a time.`);
    const big = files.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (big) return setError(`${big.name} is too large (limit ${MAX_MB} MB per file).`);
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    setReading(true);
    try {
      const { results } = await api('/customer-extract', { method: 'POST', form });
      const added = []; const msgs = [];
      results.forEach((r) => {
        r.customers.forEach((c) => added.push({ id: nextId.current++, file: r.file, c }));
        (r.notes || []).forEach((n) => msgs.push({ file: r.file, text: n }));
        if (!r.customers.length && !(r.notes || []).length) msgs.push({ file: r.file, text: 'No customer details found.' });
      });
      setRows((old) => [...(old || []), ...added]);
      setNotes((old) => [...old, ...msgs]);
    } catch (e) {
      setError(e.message);
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const edit = (id, field, value) => setRows((l) => l.map((r) => (r.id === id ? { ...r, c: { ...r.c, [field]: value } } : r)));
  const drop = (id) => setRows((l) => l.filter((r) => r.id !== id));

  async function run() {
    setBusy(true); setProgress(0); setFailed([]);
    const bad = []; const okIds = new Set(); let added = 0; let dups = 0;
    const CHUNK = 1000; // one request per 1,000 customers
    for (let i = 0; i < ready.length; i += CHUNK) {
      const part = ready.slice(i, i + CHUNK);
      try {
        const r = await api('/records/customers/bulk', {
          method: 'POST',
          body: { customers: part.map((x) => Object.fromEntries(Object.entries(x.c).map(([k, v]) => [k, text(v)]))) },
        });
        part.forEach((x) => okIds.add(x.id));
        added += r.added; dups += r.duplicates;
        (r.invalid || []).forEach((m) => bad.push(m));
      } catch (e) {
        bad.push(`Customers ${i + 1}-${i + part.length}: ${e.message}`);
      }
      setProgress(Math.min(i + CHUNK, ready.length));
    }
    setBusy(false);
    if (added) { notify(`${added} customer${added === 1 ? '' : 's'} added${dups ? `, ${dups} already existed` : ''}`); onDone(); }
    if (bad.length) { setFailed(bad); setRows((l) => l.filter((r) => !okIds.has(r.id))); } else onClose();
  }

  return (
    <Modal wide title="Add Customers from Documents" onClose={busy || reading ? () => {} : onClose}
      footer={<>
        <button type="button" className="btn btn-soft" onClick={onClose} disabled={busy || reading}>{failed.length ? 'Close' : 'Cancel'}</button>
        <button type="button" className="btn btn-green" onClick={run} disabled={busy || reading || ready.length === 0}>
          {busy ? `Saving ${progress} / ${ready.length}…` : `Add ${ready.length || ''} customer${ready.length === 1 ? '' : 's'}`}
        </button>
      </>}>
      <p className="imp-help">
        Upload <b>PDF</b>, <b>Excel / CSV</b>, <b>JSON</b> or <b>image</b> files (GST certificate, visiting card, quotation, customer sheet…). Only the
        customer details are picked out: <code>Company</code>, <code>GST</code>, <code>PAN</code>, <code>Contact Person</code>, <code>Phone</code>,
        <code> Email</code>, <code>Address</code>. An Excel sheet or JSON list with one customer per row adds all of them (thousands at once). Check the result below and fix anything before adding.
      </p>
      <div className={`imp-drop${drag ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!reading && !busy) read(e.dataTransfer.files); }}>
        <input ref={fileRef} type="file" accept={ACCEPT} multiple onChange={(e) => read(e.target.files)} hidden />
        <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={busy || reading}>
          <Upload size={16} /> {rows ? 'Add more files' : 'Choose files'}
        </button>
        <span className="imp-or">{reading ? 'Reading documents…' : 'or drop files here (PDF, Excel, CSV, JSON, JPG, PNG)'}</span>
      </div>
      {error && <div className="form-error">{error}</div>}
      {notes.length > 0 && (
        <div className="imp-notes">{notes.map((n, i) => <div key={i}><b>{n.file}:</b> {n.text}</div>)}</div>
      )}
      {rows && rows.length > 0 && (
        <>
          <div className="imp-chips">
            <span className="imp-chip ok">{count('ready')} ready</span>
            <span className="imp-chip dup">{count('duplicate')} already exist</span>
            <span className="imp-chip bad">{count('invalid')} need fixing</span>
          </div>
          <div className="imp-scroll tall">
            <table className="imp-table edit">
              <thead><tr><th>#</th>{COLS.map(([k, l]) => <th key={k}>{l}</th>)}<th>Source</th><th>Result</th><th /></tr></thead>
              <tbody>
                {rows.slice(0, SHOW_ROWS).map((r, i) => (
                  <tr key={r.id} className={`s-${checks[i]?.state}`}>
                    <td>{i + 1}</td>
                    {COLS.map(([k, , w]) => (
                      <td key={k}><input className="imp-input" style={{ minWidth: w }} value={r.c[k] || ''} onChange={(e) => edit(r.id, k, e.target.value)} disabled={busy} /></td>
                    ))}
                    <td><span className="imp-src" title={r.file}>{fileIcon(r.file)} {r.file}</span></td>
                    <td><span className={`imp-chip ${checks[i]?.state === 'ready' ? 'ok' : checks[i]?.state === 'duplicate' ? 'dup' : 'bad'}`}>{checks[i]?.note}</span></td>
                    <td><button type="button" className="icon-btn" onClick={() => drop(r.id)} disabled={busy} aria-label="Remove row"><Trash2 size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > SHOW_ROWS && (
            <p className="imp-help">Showing the first {SHOW_ROWS} of {rows.length} customers. All {count('ready')} ready customers will be added.</p>
          )}
        </>
      )}
      {failed.length > 0 && (
        <div className="form-error"><b>{failed.length} could not be saved:</b><ul>{failed.slice(0, 10).map((f, i) => <li key={i}>{f}</li>)}</ul></div>
      )}
    </Modal>
  );
}

// Two separate options inside every "All Customers" screen: add one by hand, or upload PDF / Excel / image documents.
export default function CustomerAddBar({ existing = [], onDone, variant = 'plain' }) {
  const { modules } = useApp();
  const [mode, setMode] = useState(null); // 'manual' | 'upload'
  const mod = modules?.customers;
  const close = () => setMode(null);
  const done = () => { setMode(null); onDone && onDone(); };
  const [a, b] = variant === 'sales' ? ['sp-btn b-blue', 'sp-btn b-purple'] : ['btn-new', 'btn-new btn-alt'];
  return (
    <>
      <div className={variant === 'sales' ? 'cust-bar sales' : 'table-tools'}>
        <button type="button" className={a} onClick={() => setMode('manual')}><Plus size={18} /> Add Manually</button>
        <button type="button" className={b} onClick={() => setMode('upload')}><Upload size={18} /> Upload PDF / Excel / JSON / Image</button>
      </div>
      {mode === 'manual' && mod && <RecordFormModal moduleKey="customers" mod={mod} record={{}} onClose={close} onSaved={done} />}
      {mode === 'upload' && <UploadModal existing={existing} onClose={close} onDone={() => onDone && onDone()} />}
    </>
  );
}
