import { useEffect, useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Plus, Trash2, Upload } from 'lucide-react';
import Modal from './Modal';
import { RecordFormModal } from './RecordModals';
import { api } from '../api';
import { useApp } from '../AppContext';

const ACCEPT = '.xlsx,.xls,.xlsm,.csv,.tsv';
const MAX_MB = 25;
const SHOW_ROWS = 150; // big sheets: only the first rows are drawn for editing; ALL rows are still saved
// The only details kept from the sheet (everything else in the file is ignored)
const COLS = [
  ['itemCode', 'Item Code *', 130], ['model', 'Model', 110], ['brand', 'Brand', 110], ['description', 'Description', 200],
  ['price', 'Price (₹)', 90, true], ['inward', 'Inward', 70, true], ['outward', 'Outward', 70, true], ['minStock', 'Min. Stock', 80, true], ['location', 'Location', 110],
];
const LABEL = Object.fromEntries(COLS.map(([k, l]) => [k, l.replace(' *', '')]));

const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
const key = (code) => text(code).toLowerCase();

// ready (new) | update (Item Code already in stock) | duplicate (repeated in the file, or update switched off) | invalid
function review(rows, existing, updateExisting) {
  const have = new Set((existing || []).map((p) => key(p.itemCode)));
  const seen = new Set();
  return rows.map(({ p }) => {
    if (!text(p.itemCode)) return { state: 'invalid', note: 'Item code missing' };
    const bad = COLS.find(([k, , , num]) => num && text(p[k]) !== '' && (Number.isNaN(Number(p[k])) || Number(p[k]) < 0));
    if (bad) return { state: 'invalid', note: `${LABEL[bad[0]]} must be a positive number` };
    const k = key(p.itemCode);
    if (seen.has(k)) return { state: 'duplicate', note: 'Repeated in file' };
    seen.add(k);
    if (have.has(k)) return updateExisting ? { state: 'update', note: 'Will update' } : { state: 'duplicate', note: 'Already in stock' };
    return { state: 'ready', note: 'New' };
  });
}

function ExcelModal({ onClose, onDone }) {
  const { notify } = useApp();
  // every saved product (not just what the screen shows), to tell new Item Codes from ones already in stock
  const [existing, setExisting] = useState([]);
  useEffect(() => { api('/records/inventory?limit=5000').then((r) => setExisting(r.items)).catch(() => {}); }, []);
  const fileRef = useRef(null);
  const nextId = useRef(1);
  const [rows, setRows] = useState(null); // [{ id, file, p }]
  const [found, setFound] = useState([]); // inventory fields recognised in the sheet(s)
  const [notes, setNotes] = useState([]);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [failed, setFailed] = useState([]);
  const [drag, setDrag] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(true);

  const checks = useMemo(() => review(rows || [], existing, updateExisting), [rows, existing, updateExisting]);
  const toSave = (rows || []).filter((_, i) => ['ready', 'update'].includes(checks[i]?.state));
  const count = (s) => checks.filter((x) => x.state === s).length;

  async function read(fileList) {
    const files = Array.from(fileList || []);
    setError(''); setFailed([]);
    if (!files.length) return;
    if (files.length > 10) return setError('Choose at most 10 files at a time.');
    const wrong = files.find((f) => !/\.(xlsx|xls|xlsm|csv|tsv)$/i.test(f.name));
    if (wrong) return setError(`${wrong.name} is not an Excel or CSV file.`);
    const big = files.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (big) return setError(`${big.name} is too large (limit ${MAX_MB} MB).`);
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    setReading(true);
    try {
      const { results } = await api('/inventory-import', { method: 'POST', form });
      const added = []; const msgs = []; const cols = new Set(found);
      results.forEach((r) => {
        r.products.forEach((p) => added.push({ id: nextId.current++, file: r.file, p }));
        (r.columns || []).forEach((c) => cols.add(c));
        (r.notes || []).forEach((n) => msgs.push({ file: r.file, text: n }));
      });
      setRows((old) => [...(old || []), ...added]);
      setFound([...cols]);
      setNotes((old) => [...old, ...msgs]);
    } catch (e) {
      setError(e.message);
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const edit = (id, field, value) => setRows((l) => l.map((r) => (r.id === id ? { ...r, p: { ...r.p, [field]: value } } : r)));
  const drop = (id) => setRows((l) => l.filter((r) => r.id !== id));

  async function save() {
    setBusy(true); setFailed([]); setError('');
    const CHUNK = 1000; // big sheets go in parts of 1,000 products
    const totals = { added: 0, updated: 0, duplicates: 0 };
    const bad = [];
    try {
      for (let i = 0; i < toSave.length; i += CHUNK) {
        const part = toSave.slice(i, i + CHUNK);
        const r = await api('/records/inventory/bulk', {
          method: 'POST',
          body: { updateExisting, products: part.map((x) => Object.fromEntries(COLS.map(([k]) => [k, text(x.p[k])]))) },
        });
        totals.added += r.added; totals.updated += r.updated; totals.duplicates += r.duplicates;
        (r.invalid || []).forEach((m) => bad.push(m.replace(/^Row (\d+)/, (_, n) => `Row ${Number(n) + i}`)));
      }
    } catch (e) {
      setError(e.message);
    }
    const parts = [];
    if (totals.added) parts.push(`${totals.added} product${totals.added === 1 ? '' : 's'} added`);
    if (totals.updated) parts.push(`${totals.updated} updated`);
    if (totals.duplicates) parts.push(`${totals.duplicates} skipped`);
    if (parts.length) { notify(parts.join(', ')); onDone(); }
    setBusy(false);
    if (bad.length) setFailed(bad);
    else if (parts.length) onClose();
  }

  const label = updateExisting && count('update') ? `Save ${toSave.length} product${toSave.length === 1 ? '' : 's'}` : `Add ${toSave.length || ''} product${toSave.length === 1 ? '' : 's'}`;
  return (
    <Modal wide title="Add Products from Excel" onClose={busy || reading ? () => {} : onClose}
      footer={<>
        <button type="button" className="btn btn-soft" onClick={onClose} disabled={busy || reading}>{failed.length ? 'Close' : 'Cancel'}</button>
        <button type="button" className="btn btn-green" onClick={save} disabled={busy || reading || toSave.length === 0}>{busy ? 'Saving…' : label}</button>
      </>}>
      <p className="imp-help">
        Upload an <b>Excel (.xlsx / .xls)</b> or <b>CSV</b> stock sheet or price list. Only the inventory details are picked out:
        {' '}<code>Item Code</code> (or Part No / SKU / Model), <code>Model</code>, <code>Brand</code> (Make), <code>Description</code>,
        {' '}<code>Price</code> (Rate / Unit Price), <code>Inward</code> (Qty / Stock), <code>Outward</code>, <code>Min. Stock</code> and <code>Location</code>.
        Every other column (HSN, GST, S.No, remarks…) is left out. Check the rows below before saving.
      </p>
      <div className={`imp-drop${drag ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!reading && !busy) read(e.dataTransfer.files); }}>
        <input ref={fileRef} type="file" accept={ACCEPT} multiple onChange={(e) => read(e.target.files)} hidden />
        <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={busy || reading}>
          <Upload size={16} /> {rows ? 'Add another file' : 'Choose Excel file'}
        </button>
        <span className="imp-or">{reading ? 'Reading sheet…' : 'or drop the Excel / CSV file here'}</span>
      </div>
      {error && <div className="form-error">{error}</div>}
      {notes.length > 0 && <div className="imp-notes">{notes.map((n, i) => <div key={i}><b>{n.file}:</b> {n.text}</div>)}</div>}
      {rows && rows.length > 0 && (
        <>
          {found.length > 0 && (
            <p className="imp-help" style={{ marginBottom: 6 }}>Columns used from the sheet: {found.map((c) => <code key={c} style={{ marginRight: 6 }}>{LABEL[c]}</code>)}</p>
          )}
          <div className="imp-chips">
            <span className="imp-chip ok">{count('ready')} new</span>
            <span className="imp-chip upd">{count('update')} will update existing</span>
            <span className="imp-chip dup">{count('duplicate')} skipped</span>
            <span className="imp-chip bad">{count('invalid')} need fixing</span>
            <label className="imp-toggle">
              <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} disabled={busy} />
              Update products whose Item Code is already in stock (blank cells keep the saved value)
            </label>
          </div>
          <div className="imp-scroll tall">
            <table className="imp-table edit">
              <thead><tr><th>#</th>{COLS.map(([k, l]) => <th key={k}>{l}</th>)}<th>Result</th><th /></tr></thead>
              <tbody>
                {rows.slice(0, SHOW_ROWS).map((r, i) => (
                  <tr key={r.id} className={`s-${checks[i]?.state === 'update' ? 'ready' : checks[i]?.state}`}>
                    <td>{i + 1}</td>
                    {COLS.map(([k, , w, num]) => (
                      <td key={k}>
                        <input className="imp-input" style={{ minWidth: w }} inputMode={num ? 'decimal' : undefined}
                          value={r.p[k] ?? ''} onChange={(e) => edit(r.id, k, e.target.value)} disabled={busy} aria-label={LABEL[k]} />
                      </td>
                    ))}
                    <td><span className={`imp-chip ${{ ready: 'ok', update: 'upd', duplicate: 'dup' }[checks[i]?.state] || 'bad'}`}>{checks[i]?.note}</span></td>
                    <td><button type="button" className="icon-btn" onClick={() => drop(r.id)} disabled={busy} aria-label="Remove row"><Trash2 size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > SHOW_ROWS && <p className="imp-help">Showing the first {SHOW_ROWS} of {rows.length} rows. All {toSave.length} valid products will be saved.</p>}
        </>
      )}
      {failed.length > 0 && (
        <div className="form-error"><b>{failed.length} row{failed.length === 1 ? '' : 's'} could not be saved:</b><ul>{failed.slice(0, 10).map((f, i) => <li key={i}>{f}</li>)}</ul></div>
      )}
    </Modal>
  );
}

// "Add Product" on every inventory screen: one by hand, or many from an Excel / CSV sheet.
export default function InventoryAddBar({ onDone, variant = 'plain' }) {
  const { modules } = useApp();
  const [mode, setMode] = useState(null); // 'manual' | 'excel'
  const mod = modules?.inventory;
  const close = () => setMode(null);
  const [a, b] = variant === 'sales' ? ['sp-btn b-green', 'sp-btn b-teal'] : ['btn btn-green', 'btn btn-primary'];
  return (
    <>
      <button type="button" className={a} onClick={() => setMode('manual')}><Plus size={18} /> Add Product Manually</button>
      <button type="button" className={b} onClick={() => setMode('excel')}><FileSpreadsheet size={18} /> Upload Excel</button>
      {mode === 'manual' && mod && (
        <RecordFormModal moduleKey="inventory" mod={mod} record={{ inward: 0, outward: 0 }} onClose={close} onSaved={() => { close(); onDone && onDone(); }} />
      )}
      {mode === 'excel' && <ExcelModal onClose={close} onDone={() => onDone && onDone()} />}
    </>
  );
}
