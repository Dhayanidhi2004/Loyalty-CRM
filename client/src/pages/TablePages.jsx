import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import Shell from '../components/Shell';
import { BackPill, Loading, StatusBadge } from '../components/Bits';
import { RecordFormModal, RecordViewModal } from '../components/RecordModals';
import { api } from '../api';
import { useApp } from '../AppContext';
import { csvColumns, downloadCsv, fmtDate } from '../format';
import { canCreate, canDelete, canEditRecord, levelOf } from '../access';

const usDate = (v) => (v ? new Date(v).toLocaleDateString('en-US') : '—');
const time = (v) => (v ? new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—');

// The table from the "Completed Enquiries" screen, reused wherever records are listed in rows.
export function FancyTable({ columns, rows, onRowClick, onDelete, emptyText, compact = false }) {
  return (
    <div className="fancy-wrap">
      <table className={`fancy${compact ? ' compact' : ''}`}>
        <thead>
          <tr>
            {columns.map((c) => <th key={c.label} className={c.center ? 'c' : ''}>{c.label}</th>)}
            {onDelete && <th className="c">Delete</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={columns.length + (onDelete ? 1 : 0)} className="fancy-empty">{emptyText}</td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} onClick={() => onRowClick?.(r)}>
              {columns.map((c) => (
                <td key={c.label} className={`${c.cls || ''}${c.center ? ' c' : ''}`}>{c.render ? c.render(r) : r[c.key] || '—'}</td>
              ))}
              {onDelete && (
                <td className="c" onClick={(e) => e.stopPropagation()}>
                  <button className="trash" title="Delete" aria-label="Delete" onClick={() => onDelete(r)}><Trash2 size={24} strokeWidth={2.3} /></button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Shared list behaviour: load, view, edit, delete.
function useRecordList(moduleKey, query) {
  const { modules, user, notify } = useApp();
  const mod = modules?.[moduleKey];
  const [items, setItems] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const level = levelOf(user, moduleKey);
  const isAdmin = level === 'admin';

  const queryKey = JSON.stringify(query || {}); // stable dependency even if the caller builds a new object
  const lastParams = useRef(null); // so a refresh after editing keeps the current filters
  const load = useCallback(async (extra) => {
    const params = extra || lastParams.current || JSON.parse(queryKey);
    lastParams.current = params;
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
    try {
      const r = await api(`/records/${moduleKey}?${qs}`);
      setItems(r.items);
    } catch (e) {
      notify(e.message, 'error');
      setItems([]);
    }
  }, [moduleKey, queryKey, notify]);

  async function remove(rec) {
    if (!confirm(`Delete this ${mod.singular.toLowerCase()}? This cannot be undone.`)) return;
    try {
      await api(`/records/${moduleKey}/${rec.id}`, { method: 'DELETE' });
      notify(`${mod.singular} deleted`);
      setViewing(null);
      setItems((list) => list.filter((x) => x.id !== rec.id));
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  const canEdit = (r) => canEditRecord(level, r, user);
  const modals = mod && (
    <>
      {viewing && (
        <RecordViewModal
          mod={mod} record={viewing} showOwner={isAdmin} onClose={() => setViewing(null)}
          onEdit={canEdit(viewing) ? () => { setEditing(viewing); setViewing(null); } : null}
          onDelete={canDelete(level) ? () => remove(viewing) : null}
        />
      )}
      {editing && (
        <RecordFormModal moduleKey={moduleKey} mod={mod} record={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </>
  );
  return { mod, items, setItems, load, remove, setViewing, setEditing, isAdmin, modals, user, level };
}

/* ---------------- All Customers -> "Completed Enquiries" ---------------- */
export function CustomersPage({ back, createdBy }) {
  const query = createdBy ? { createdBy } : null;
  const { mod, items, load, remove, setViewing, setEditing, isAdmin, modals, level } = useRecordList('customers', query);
  const [search, setSearch] = useState('');
  useEffect(() => { load(); }, [load]);

  const q = search.trim().toLowerCase();
  const rows = (items || []).filter((c) => !q || [c.companyName, c.pan, c.gst, c.cusId, c.contactPerson, c.phone].some((x) => String(x || '').toLowerCase().includes(q)));
  const columns = [
    { label: 'Cus ID', key: 'cusId', cls: 'idcell' },
    { label: 'Company', key: 'companyName' },
    { label: 'GST', key: 'gst' },
    { label: 'PAN', key: 'pan' },
    { label: 'Date', render: (r) => usDate(r.createdAt), center: true },
  ];

  return (
    <Shell>
      <div className="page bg-lilac">
        <div className="page-inner wide">
          <div className="head-row underlined">
            <h1 className="title-dark">{mod?.title || 'Completed Enquiries'}</h1>
            <BackPill to={back} />
          </div>
          <div className="big-search">
            <Search size={24} />
            <input placeholder="Search company, PAN, GST" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {!isAdmin && canCreate(level) && (
            <div className="table-tools"><button className="btn-new" onClick={() => setEditing({})}><Plus size={18} /> Add Customer</button></div>
          )}
          {items === null ? <Loading /> : (
            <FancyTable columns={columns} rows={rows} onRowClick={setViewing} onDelete={isAdmin ? remove : null} emptyText={q ? 'No customers match your search.' : 'No completed enquiries yet.'} />
          )}
        </div>
      </div>
      {modals}
    </Shell>
  );
}

const leadColumns = (isAdmin) => [
  { label: 'Customer', key: 'customerName', cls: 'idcell' },
  { label: 'Company', key: 'companyName' },
  { label: 'Phone', key: 'phone' },
  { label: 'Product', key: 'product' },
  { label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ...(isAdmin ? [{ label: 'Employee', render: (r) => r.createdByName || '—' }] : []),
  { label: 'Date', render: (r) => fmtDate(r.createdAt), center: true },
];

/* ---------------- All Lead Enquiries -> "Lead Enquiry" ---------------- */
export function LeadEnquiryPage({ back, createdBy }) {
  const { mod, items, load, remove, setViewing, isAdmin, modals } = useRecordList('leads', null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const { notify } = useApp();

  async function fetchEnquiries(e) {
    e?.preventDefault();
    if (from && to && to < from) return notify('To Date cannot be before From Date', 'error');
    setBusy(true);
    await load({ from, to, createdBy });
    setBusy(false);
  }
  // coming from an employee's profile: show their enquiries straight away
  useEffect(() => { if (createdBy) load({ createdBy }); }, [createdBy, load]);

  function exportCsv() {
    const cols = [
      ...csvColumns(mod),
      { label: 'Status', get: (r) => r.status },
      { label: 'Employee', get: (r) => r.createdByName },
      { label: 'Date', get: (r) => fmtDate(r.createdAt) },
    ];
    downloadCsv(`lead-enquiries-${from || 'all'}-${to || 'all'}.csv`, cols, items || []);
  }

  return (
    <Shell>
      <div className="page bg-soft">
        <div className="page-inner narrow">
          <div className="head-row">
            <h1 className="title-heavy">Lead Enquiry</h1>
            <BackPill to={back} variant="blue" />
          </div>
          <form className="filter-card" onSubmit={fetchEnquiries}>
            <div className="filter-grid">
              <div>
                <label htmlFor="f-from">From Date:</label>
                <input id="f-from" className="filter-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <label htmlFor="f-to">To Date:</label>
                <input id="f-to" className="filter-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
            <button className="btn-fetch" disabled={busy}>{busy ? 'Fetching…' : 'Fetch Enquiries'}</button>
          </form>

          {items !== null && (
            <div style={{ marginTop: 40 }}>
              <div className="table-tools" style={{ marginTop: 0, justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#4b5563', fontSize: 17 }}>{items.length} {items.length === 1 ? 'enquiry' : 'enquiries'}</span>
                {items.length > 0 && <button className="doc-btn" onClick={exportCsv}>Export CSV</button>}
              </div>
              <FancyTable compact columns={leadColumns(isAdmin)} rows={items} onRowClick={setViewing} onDelete={isAdmin ? remove : null} emptyText="No enquiries found for these dates." />
            </div>
          )}
        </div>
      </div>
      {modals}
    </Shell>
  );
}

/* ---------------- Today's Converted / Not Converted ---------------- */
export function TodayLeadsPage({ back, today }) {
  const converted = today === 'converted';
  const { items, load, remove, setViewing, isAdmin, modals } = useRecordList('leads', { today });
  useEffect(() => { load(); }, [load]);
  const columns = [
    ...leadColumns(isAdmin).filter((c) => c.label !== 'Date' && c.label !== 'Status'),
    { label: converted ? 'Converted At' : 'Updated At', render: (r) => time(r.statusChangedAt), center: true },
  ];
  return (
    <Shell>
      <div className="page bg-lilac">
        <div className="page-inner wide">
          <div className="head-row underlined">
            <h1 className="title-dark">{converted ? "Today's Converted Customers" : "Today's Not Converted"}</h1>
            <BackPill to={back} />
          </div>
          <div style={{ height: 40 }} />
          {items === null ? <Loading /> : (
            <FancyTable columns={columns} rows={items} onRowClick={setViewing} onDelete={isAdmin ? remove : null}
              emptyText={converted ? 'No leads converted today yet.' : 'No leads marked not converted today.'} />
          )}
        </div>
      </div>
      {modals}
    </Shell>
  );
}
