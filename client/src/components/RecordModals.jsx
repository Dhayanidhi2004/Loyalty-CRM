import { useEffect, useState } from 'react';
import { Paperclip, Plus, Upload, X } from 'lucide-react';
import Modal from './Modal';
import { StatusBadge } from './Bits';
import { api, uploadFile, fileUrl } from '../api';
import { useApp } from '../AppContext';
import { fmtValue, fmtDateTime, fmtMoney } from '../format';
import { canCreate, canEditAll, levelOf } from '../access';

// Cached employee lists for dropdowns (fetched once per session).
const listCache = {};
function useEmployeeList(path, enabled = true) {
  const [list, setList] = useState(listCache[path] || []);
  useEffect(() => {
    if (!enabled || listCache[path]) return;
    api(path)
      .then((r) => {
        listCache[path] = r;
        setList(r);
      })
      .catch(() => {});
  }, [path, enabled]);
  return list;
}

// The sales team a lead can be handed to (Sales Head / admin only).
export const useAssignable = (enabled = true) => useEmployeeList('/employees/assignable', enabled);
// Active Sales Heads, for the "Sales Head ID" choice on the enquiry form.
export const useSalesHeads = (enabled = true) => useEmployeeList('/employees/sales-heads', enabled);

// Employee fields:
//  - "Sales Head ID" (employeeList: 'salesHeads'): anyone who can add the record picks a Sales Head
//  - "Assigned To": a dropdown for team leads, read-only text for everyone else
function EmployeeSelect({ id, f, value, onChange, moduleKey, currentName }) {
  const { user } = useApp();
  const level = levelOf(user, moduleKey);
  const heads = f.employeeList === 'salesHeads';
  const mayPick = heads ? canCreate(level) : canEditAll(level);
  const assignable = useAssignable(mayPick && !heads);
  const salesHeads = useSalesHeads(mayPick && heads);
  const people = heads ? salesHeads : assignable;
  if (!mayPick) return <input id={id} className="inp" value={currentName || (value ? 'Assigned' : 'Not assigned yet')} readOnly />;
  return (
    <select id={id} className="sel" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">{heads ? 'Select Sales Head' : 'Not assigned'}</option>
      {people.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code || p.role})</option>)}
    </select>
  );
}

export function FileField({ value, onChange, folder, accept }) {
  const { notify } = useApp();
  const [busy, setBusy] = useState(false);
  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const { url } = await uploadFile(file, folder);
      onChange(url);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="upload-row">
      <label className="btn btn-soft" style={{ cursor: busy ? 'wait' : 'pointer' }}>
        <Upload size={16} /> {busy ? 'Uploading…' : value ? 'Replace file' : 'Choose file'}
        <input type="file" hidden accept={accept} onChange={pick} disabled={busy} />
      </label>
      {value && (
        <>
          <a className="file-link" href={fileUrl(value)} target="_blank" rel="noreferrer">
            <Paperclip size={14} /> View
          </a>
          <button type="button" className="btn btn-danger" style={{ height: 36 }} onClick={() => onChange(null)}>
            Remove
          </button>
        </>
      )}
    </div>
  );
}

// fields a person types in (totals are worked out by the server); hidden ones are kept but not shown
const editableFields = (mod) => mod.fields.filter((f) => !f.computed);
const visible = (f) => !f.hidden;

const blankRow = (f) => Object.fromEntries(f.columns.filter((c) => !c.computed).map((c) => [c.key, '']));
const lineTotal = (f, row) => (f.lineTotal ? (Number(row[f.lineTotal.qty]) || 0) * (Number(row[f.lineTotal.price]) || 0) : null);

// Editable table of line items (products, PI items, sales order items…)
export function ItemsEditor({ f, value, onChange }) {
  const rows = Array.isArray(value) && value.length ? value : [blankRow(f)];
  const inputs = f.columns.filter((c) => !c.computed);
  const template = `${inputs.map((c) => (c.type === 'text' ? '1.6fr' : '0.9fr')).join(' ')}${f.lineTotal ? ' 1fr' : ''} 36px`;
  const setCell = (i, k) => (e) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)));
  const total = rows.reduce((t, r) => t + (lineTotal(f, r) || 0), 0);
  return (
    <div className="items-editor">
      <div className="items-row head" style={{ gridTemplateColumns: template }}>
        {inputs.map((c) => <span key={c.key}>{c.formLabel || c.label}</span>)}
        {f.lineTotal && <span style={{ textAlign: 'right' }}>Total</span>}
        <span />
      </div>
      {rows.map((r, i) => (
        <div className="items-row" key={i} style={{ gridTemplateColumns: template }}>
          {inputs.map((c) => (
            <input
              key={c.key} className="inp" aria-label={c.formLabel || c.label} placeholder={c.formLabel || c.label}
              type={c.type === 'text' ? 'text' : 'number'} min={c.type === 'text' ? undefined : 0} step={c.type === 'currency' ? '0.01' : undefined}
              value={r[c.key] ?? ''} onChange={setCell(i, c.key)}
            />
          ))}
          {f.lineTotal && <span className="amt">{fmtMoney(lineTotal(f, r))}</span>}
          <button type="button" className="icon-btn danger" aria-label="Remove row" disabled={rows.length === 1} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            <X size={15} />
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <button type="button" className="btn btn-soft" style={{ height: 38 }} onClick={() => onChange([...rows, blankRow(f)])}><Plus size={16} /> Add row</button>
        {f.lineTotal && <span style={{ fontSize: 14, color: '#4b5563' }}>Items total <b style={{ color: '#111827' }}>{fmtMoney(total)}</b></span>}
      </div>
    </div>
  );
}

function ItemsView({ f, value }) {
  const rows = Array.isArray(value) ? value : [];
  if (!rows.length) return <p>—</p>;
  return (
    <div className="table-wrap" style={{ marginTop: 4 }}>
      <table className="data" style={{ fontSize: 14 }}>
        <thead><tr>{f.columns.map((c) => <th key={c.key}>{c.formLabel || c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ cursor: 'default' }}>
              {f.columns.map((c) => <td key={c.key}>{c.type === 'currency' ? fmtMoney(r[c.key]) : r[c.key] ?? '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Field({ f, value, onChange, moduleKey, record }) {
  const common = { id: f.key, className: 'inp', value: value ?? '', onChange: (e) => onChange(e.target.value) };
  let input;
  if (f.type === 'employee') input = <EmployeeSelect id={f.key} f={f} value={value} onChange={onChange} moduleKey={moduleKey} currentName={record?.[`${f.key}Name`]} />;
  else if (f.type === 'textarea') input = <textarea {...common} rows={3} />;
  else if (f.type === 'select')
    input = (
      <select {...common} className="sel">
        <option value="">Select…</option>
        {f.options.map((o) => <option key={o}>{o}</option>)}
      </select>
    );
  else if (f.type === 'file') input = <FileField value={value} onChange={onChange} folder={moduleKey} />;
  else if (f.type === 'items') input = <ItemsEditor f={f} value={value} onChange={onChange} />;
  else
    input = (
      <>
        <input
          {...common}
          type={f.type === 'currency' ? 'number' : f.type}
          step={f.type === 'currency' ? '0.01' : f.type === 'number' ? 'any' : undefined}
          placeholder={f.autoNumber ? 'Auto-generated if left blank' : f.suggestions ? 'Type or pick…' : ''}
          list={f.suggestions ? `${f.key}-options` : undefined}
        />
        {f.suggestions && (
          <datalist id={`${f.key}-options`}>
            {f.suggestions.map((o) => <option key={o} value={o} />)}
          </datalist>
        )}
      </>
    );
  return (
    <div className={`fld${['textarea', 'file', 'items'].includes(f.type) ? ' full' : ''}`}>
      <label htmlFor={f.key}>
        {f.formLabel || f.label} {f.required && <i>*</i>}
      </label>
      {input}
    </div>
  );
}

// Create / edit any module record from its field config.
// `only` (optional) limits which fields are shown, e.g. the Lead Filler edits just the enquiry-form fields.
export function RecordFormModal({ moduleKey, mod, record, onClose, onSaved, only }) {
  const { notify } = useApp();
  const editing = !!record?.id;
  const [values, setValues] = useState(() => {
    const v = {};
    for (const f of editableFields(mod)) v[f.key] = f.type === 'items' ? (record?.[f.key]?.length ? record[f.key] : [blankRow(f)]) : record?.[f.key] ?? '';
    if (mod.statuses) v.status = record?.status || mod.statuses[0];
    return v;
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k) => (val) => setValues((s) => ({ ...s, [k]: val }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    const missing = editableFields(mod).filter((f) => (!only || only(f)) && f.required && !f.autoNumber && (values[f.key] === '' || values[f.key] == null));
    if (missing.length) return setError(`Please fill: ${missing.map((f) => f.label).join(', ')}`);
    setSaving(true);
    try {
      const saved = await api(editing ? `/records/${moduleKey}/${record.id}` : `/records/${moduleKey}`, {
        method: editing ? 'PUT' : 'POST',
        body: values,
      });
      notify(`${mod.singular} ${editing ? 'updated' : 'added'}`);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      wide
      title={`${editing ? 'Edit' : 'Add'} ${mod.singular}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-soft" onClick={onClose}>Cancel</button>
          <button type="submit" form="record-form" className="btn btn-green" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save Changes' : `Add ${mod.singular}`}
          </button>
        </>
      }
    >
      {error && <div className="form-error">{error}</div>}
      <form id="record-form" className="form-grid" onSubmit={submit} noValidate>
        {mod.statuses && !only && (
          <div className="fld">
            <label htmlFor="status">Status</label>
            <select id="status" className="sel" value={values.status} onChange={(e) => set('status')(e.target.value)}>
              {mod.statuses.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        )}
        {editableFields(mod).filter((f) => visible(f) && (!only || only(f))).map((f) => (
          <Field key={f.key} f={f} value={values[f.key]} onChange={set(f.key)} moduleKey={moduleKey} record={record} />
        ))}
      </form>
    </Modal>
  );
}

export function RecordViewModal({ mod, record, onClose, onEdit, onDelete, showOwner }) {
  return (
    <Modal
      wide
      title={mod.singular}
      onClose={onClose}
      footer={
        <>
          {onDelete && <button className="btn btn-danger" onClick={onDelete}>Delete</button>}
          <span style={{ flex: 1 }} />
          <button className="btn btn-soft" onClick={onClose}>Close</button>
          {onEdit && <button className="btn btn-primary" onClick={onEdit}>Edit</button>}
        </>
      }
    >
      <div className="detail-grid">
        {mod.statuses && (
          <div>
            <span>Status</span>
            <p><StatusBadge status={record.status} /></p>
          </div>
        )}
        {mod.fields.filter((f) => f.type === 'items').map((f) => (
          <div key={f.key} className="full" style={{ order: 1 }}>
            <span>{f.label}</span>
            <ItemsView f={f} value={record[f.key]} />
          </div>
        ))}
        {mod.fields.filter((f) => f.type !== 'items' && visible(f)).map((f) => (
          <div key={f.key} className={f.type === 'textarea' ? 'full' : ''}>
            <span>{f.label}</span>
            <p>
              {f.type === 'file' && record[f.key] ? (
                <a className="file-link" href={fileUrl(record[f.key])} target="_blank" rel="noreferrer">Open file</a>
              ) : f.type === 'employee' ? (
                record[`${f.key}Name`] ? `${record[`${f.key}Name`]}${record[`${f.key}Code`] ? ` (${record[`${f.key}Code`]})` : ''}` : f.employeeList ? '—' : 'Not assigned'
              ) : (
                fmtValue(f, record[f.key])
              )}
            </p>
          </div>
        ))}
        {showOwner && (
          <div>
            <span>Created By</span>
            <p>{record.createdByName || '—'}</p>
          </div>
        )}
        <div>
          <span>Created On</span>
          <p>{fmtDateTime(record.createdAt)}</p>
        </div>
        {record.updatedAt !== record.createdAt && (
          <div>
            <span>Last Updated</span>
            <p>{fmtDateTime(record.updatedAt)}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
