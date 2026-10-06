import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Eye, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api, fileUrl } from '../api';
import { useApp } from '../AppContext';
import { StatusBadge, Loading } from './Bits';
import { RecordFormModal, RecordViewModal } from './RecordModals';
import { fmtValue, fmtDate, downloadCsv, csvColumns } from '../format';
import { canCreate, canDelete, canEditRecord, canSeeAll, levelOf } from '../access';

// Search + filters + table + add/view/edit/delete for one module.
export default function RecordsPanel({ moduleKey, today, createdBy, startAdding = false, compact = false }) {
  const { modules, user, notify } = useApp();
  const mod = modules?.[moduleKey];
  const level = levelOf(user, moduleKey);
  const isAdmin = level === 'admin';
  const canWrite = canCreate(level);
  const showOwner = canSeeAll(level) && moduleKey !== 'inventory';

  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(startAdding && canWrite ? {} : null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (debounced) qs.set('search', debounced);
    if (status) qs.set('status', status);
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (today) qs.set('today', today);
    if (createdBy) qs.set('createdBy', createdBy);
    try {
      const r = await api(`/records/${moduleKey}?${qs}`);
      setItems(r.items);
      setTotal(r.total);
    } catch (e) {
      notify(e.message, 'error');
      setItems([]);
    }
  }, [moduleKey, debounced, status, from, to, today, createdBy, notify]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  const columns = useMemo(() => (mod ? mod.fields.filter((f) => f.table) : []), [mod]);
  if (!mod) return <Loading />;

  async function remove(rec) {
    if (!confirm(`Delete this ${mod.singular.toLowerCase()}? This cannot be undone.`)) return;
    try {
      await api(`/records/${moduleKey}/${rec.id}`, { method: 'DELETE' });
      notify(`${mod.singular} deleted`);
      setViewing(null);
      load();
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  function exportCsv() {
    const cols = [
      ...csvColumns(mod),
      ...(mod.statuses ? [{ label: 'Status', get: (r) => r.status }] : []),
      ...(showOwner ? [{ label: 'Created By', get: (r) => r.createdByName }] : []),
      { label: 'Created On', get: (r) => fmtDate(r.createdAt) },
    ];
    downloadCsv(`${mod.label.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`, cols, items || []);
  }

  const canEditRow = (r) => canEditRecord(level, r, user);
  const isLow = (r) => moduleKey === 'inventory' && Number(r.current) <= Number(r.minStock || 0);

  return (
    <>
      <div className="toolbar">
        <div className="search grow">
          <Search size={17} />
          <input className="inp" placeholder={`Search ${mod.label.toLowerCase()}…`} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {mod.statuses && !today && (
          <select className="sel" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
            <option value="">All statuses</option>
            {mod.statuses.map((s) => <option key={s}>{s}</option>)}
          </select>
        )}
        {!compact && !today && (
          <>
            <input className="inp" type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="Created from" aria-label="From date" />
            <input className="inp" type="date" value={to} onChange={(e) => setTo(e.target.value)} title="Created to" aria-label="To date" />
          </>
        )}
        <button className="btn btn-soft" onClick={exportCsv} disabled={!items?.length}>
          <Download size={16} /> Export
        </button>
        {canWrite && (
          <button className="btn btn-green" onClick={() => setEditing({})}>
            <Plus size={17} /> Add {mod.singular}
          </button>
        )}
      </div>

      {items === null ? (
        <Loading />
      ) : (
        <>
          <div className="result-count">
            {total} {total === 1 ? 'record' : 'records'}
            {moduleKey === 'inventory' && items.some(isLow) && ' · rows in red are at or below minimum stock'}
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  {columns.map((c) => <th key={c.key}>{c.label}</th>)}
                  {mod.statuses && <th>Status</th>}
                  {showOwner && <th>Created By</th>}
                  <th>Created On</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 5} className="empty">No {mod.label.toLowerCase()} found.</td>
                  </tr>
                )}
                {items.map((r, i) => (
                  <tr key={r.id} className={isLow(r) ? 'low' : ''} onClick={() => setViewing(r)}>
                    <td>{i + 1}</td>
                    {columns.map((c) => (
                      <td key={c.key} className={c.type === 'textarea' ? 'clip' : ''}>
                        {c.type === 'file' && r[c.key] ? (
                          <a className="file-link" href={fileUrl(r[c.key])} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Open</a>
                        ) : (
                          fmtValue(c, r[c.key])
                        )}
                      </td>
                    ))}
                    {mod.statuses && <td><StatusBadge status={r.status} /></td>}
                    {showOwner && <td>{r.createdByName || '—'}</td>}
                    <td>{fmtDate(r.createdAt)}</td>
                    <td className="actions" onClick={(e) => e.stopPropagation()}>
                      <button className="icon-btn" title="View" onClick={() => setViewing(r)}><Eye size={16} /></button>
                      {canEditRow(r) && <button className="icon-btn" title="Edit" onClick={() => setEditing(r)}><Pencil size={16} /></button>}
                      {canDelete(level) && <button className="icon-btn danger" title="Delete" onClick={() => remove(r)}><Trash2 size={16} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {viewing && (
        <RecordViewModal
          mod={mod}
          record={viewing}
          showOwner={showOwner}
          onClose={() => setViewing(null)}
          onEdit={canEditRow(viewing) ? () => { setEditing(viewing); setViewing(null); } : null}
          onDelete={isAdmin ? () => remove(viewing) : null}
        />
      )}
      {editing && (
        <RecordFormModal
          moduleKey={moduleKey}
          mod={mod}
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}
