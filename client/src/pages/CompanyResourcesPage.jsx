import { useCallback, useEffect, useState } from 'react';
import { Pencil, RefreshCw, Search, Trash2 } from 'lucide-react';
import Shell from '../components/Shell';
import Modal from '../components/Modal';
import { BackPill, Loading } from '../components/Bits';
import { api } from '../api';
import { useApp } from '../AppContext';
import { homeFor } from './Login';

const STATUSES = ['provided', 'returned', 'lost'];
const dmy = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10).split('-').reverse().join('/') : null);
const joined = (e) => dmy(e.joining_date) || dmy(e.created_at?.slice?.(0, 10));

function ResourceForm({ employee, index, onClose, onSaved }) {
  const { notify } = useApp();
  const current = employee.resources[index];
  const [v, setV] = useState({ name: current.name || '', code: current.code || '', endDate: current.endDate || '', status: current.status || 'provided' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    if (!v.name.trim()) return notify('Resource name is required', 'error');
    setBusy(true);
    try {
      const resources = employee.resources.map((r, i) => (i === index ? v : r));
      await api(`/employees/${employee.id}`, { method: 'PUT', body: { resources } });
      notify('Resource updated');
      onSaved();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Edit resource · ${employee.name}`}
      onClose={onClose}
      footer={<><button className="btn btn-soft" onClick={onClose}>Cancel</button><button className="btn btn-green" form="res-form" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}
    >
      <form id="res-form" className="form-grid" onSubmit={save}>
        <div className="fld"><label>Resource</label><input className="inp" value={v.name} onChange={set('name')} placeholder="Laptop" /></div>
        <div className="fld"><label>Resource ID</label><input className="inp" value={v.code} onChange={set('code')} placeholder="#PD12" /></div>
        <div className="fld"><label>End Date</label><input className="inp" type="date" value={v.endDate || ''} onChange={set('endDate')} /></div>
        <div className="fld"><label>Status</label>
          <select className="sel" value={v.status} onChange={set('status')}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        </div>
      </form>
    </Modal>
  );
}

// "Company Resources Management": every employee with the items handed to them.
// Admin sees everyone and can edit/delete; an employee sees only their own.
export default function CompanyResourcesPage() {
  const { user, notify } = useApp();
  const isAdmin = user.role === 'admin';
  const [list, setList] = useState(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setList(null);
    try {
      if (isAdmin) setList(await api('/employees'));
      else setList([(await api(`/employees/${user.id}`)).employee]);
    } catch (e) {
      notify(e.message, 'error');
      setList([]);
    }
  }, [isAdmin, user.id, notify]);
  useEffect(() => { load(); }, [load]);

  async function removeResource(emp, index) {
    const r = emp.resources[index];
    if (!confirm(`Remove ${r.name || 'this resource'} from ${emp.name}?`)) return;
    try {
      await api(`/employees/${emp.id}`, { method: 'PUT', body: { resources: emp.resources.filter((_, i) => i !== index) } });
      notify('Resource removed');
      load();
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  const q = search.trim().toLowerCase();
  const rows = (list || []).filter((e) => {
    if (!q) return true;
    const hay = [e.name, e.emp_code, ...(e.resources || []).flatMap((r) => [r.name, r.code, r.status])].join(' ').toLowerCase();
    return hay.includes(q);
  });

  const EmployeeCell = ({ e }) => (
    <td className="cr-emp">
      <div>{e.name}</div>
      <div className="id">ID: {e.emp_code || '—'}</div>
      {joined(e) && <div className="muted">Joined: {joined(e)}</div>}
    </td>
  );

  return (
    <Shell>
      <div className="page bg-grey">
        <div className="cr-bar">
          <div className="cr-bar-inner">
            <BackPill to={homeFor(user)} />
            <h1>Company Resources Management</h1>
            <span style={{ flex: 1 }} />
            <button className="cr-refresh" onClick={load} aria-label="Refresh" title="Refresh"><RefreshCw size={24} /></button>
          </div>
        </div>
        <div className="page-inner" style={{ paddingTop: 30 }}>
          <div className="cr-search">
            <Search size={20} />
            <input placeholder="Search by name, ID, resource..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {list === null ? <Loading /> : (
            <div className="cr-table">
              <table>
                <thead>
                  <tr><th>Employee</th><th>Resource Details</th><th className="c">Status</th><th className="c">{isAdmin ? 'Actions' : ''}</th></tr>
                </thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={4} className="cr-none">No employees found.</td></tr>}
                  {rows.flatMap((e) => {
                    const res = e.resources || [];
                    if (res.length === 0) {
                      return [(
                        <tr key={`${e.id}-none`}>
                          <EmployeeCell e={e} />
                          <td colSpan={3} className="cr-none">No company resources found.</td>
                        </tr>
                      )];
                    }
                    return res.map((r, i) => (
                      <tr key={`${e.id}-${i}`}>
                        <EmployeeCell e={e} />
                        <td className="cr-res">
                          <div>{r.name || '—'}</div>
                          {r.code && <div className="id">{r.code}</div>}
                          {r.endDate && <div className="muted">End Date: {dmy(r.endDate)}</div>}
                        </td>
                        <td className="c"><span className={`cr-status ${r.status || 'provided'}`}>{r.status || 'provided'}</span></td>
                        <td className="c">
                          {isAdmin && (
                            <>
                              <button className="cr-act edit" aria-label="Edit" onClick={() => setEditing({ employee: e, index: i })}><Pencil size={22} /></button>
                              <button className="cr-act del" aria-label="Delete" onClick={() => removeResource(e, i)}><Trash2 size={22} /></button>
                            </>
                          )}
                        </td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {editing && <ResourceForm employee={editing.employee} index={editing.index} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </Shell>
  );
}
