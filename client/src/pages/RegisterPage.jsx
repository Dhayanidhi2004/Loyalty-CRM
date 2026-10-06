import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff, X } from 'lucide-react';
import Shell from '../components/Shell';
import { BackPill, Loading } from '../components/Bits';
import { api, uploadFile, fileUrl } from '../api';
import { useApp } from '../AppContext';
import { LOGIN_ROLES } from '../access';

const EMPTY = {
  name: '', email: '', password: '', roleChoice: '', joining_date: '', phone: '', salary: '', address: '',
  resources: [], photo: null, document: null, ending_date: '', remarks: '',
};

// Native file picker in a bordered box (as in the original), uploading as soon as a file is chosen.
function FileBox({ value, onChange, folder, accept }) {
  const { notify } = useApp();
  const [busy, setBusy] = useState(false);
  async function pick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const { url } = await uploadFile(file, folder);
      onChange(url);
    } catch (err) {
      notify(err.message, 'error');
      e.target.value = '';
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="reg-file">
      <input type="file" accept={accept} onChange={pick} disabled={busy} />
      {busy && <span className="done" style={{ color: '#6b7280' }}>Uploading…</span>}
      {!busy && value && (
        <span className="done">
          <CheckCircle2 size={16} /> Uploaded · <a href={fileUrl(value)} target="_blank" rel="noreferrer">View</a>
        </span>
      )}
    </div>
  );
}

// "Add Employee" quick action (/admin/register) and Edit Employee (/admin/register/:id).
export default function RegisterPage() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const { notify, user } = useApp();
  const [v, setV] = useState(editing ? null : EMPTY);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState(LOGIN_ROLES);

  useEffect(() => {
    api('/employees/roles').then((r) => setRoles(r.roles)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!editing) return;
    api(`/employees/${id}`)
      .then(({ employee: e }) => {
        const roleChoice = e.role === 'admin' ? 'Admin' : e.designation || '';
        setV({
          ...EMPTY,
          ...Object.fromEntries(Object.entries(e).map(([k, val]) => [k, val ?? ''])),
          password: '',
          roleChoice,
          salary: e.salary ?? '',
          resources: Array.isArray(e.resources) ? e.resources : [],
          photo: e.photo || null,
          document: e.document || null,
        });
      })
      .catch((err) => {
        notify(err.message, 'error');
        navigate('/admin/adminDasboard');
      });
  }, [editing, id, navigate, notify]);

  if (!v) return <Shell><div className="page bg-indigo"><Loading /></div></Shell>;

  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const setRes = (i, k) => (e) => setV((s) => ({ ...s, resources: s.resources.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)) }));
  // "Admin" only appears when editing an existing admin account; new logins pick one of the roles.
  const roleOptions = v.roleChoice === 'Admin' ? ['Admin', ...roles] : roles;

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!v.name.trim() || !v.email.trim() || (!editing && !v.password)) return setError('Name, Email and Password are required.');
    if (!v.roleChoice) return setError('Please choose a role.');
    if (v.resources.some((r) => !r.name.trim() && (r.code || r.endDate))) return setError('Each company resource needs a name.');
    if (v.password && v.password.length < 6) return setError('Password must be at least 6 characters.');
    if (v.ending_date && v.joining_date && v.ending_date < v.joining_date) return setError('Ending date cannot be before the joining date.');

    const body = {
      name: v.name, email: v.email, phone: v.phone, joining_date: v.joining_date, salary: v.salary, address: v.address,
      resources: v.resources, photo: v.photo, document: v.document, ending_date: v.ending_date, remarks: v.remarks,
      designation: v.roleChoice === 'Admin' ? 'Administrator' : v.roleChoice,
      role: v.roleChoice === 'Admin' ? 'admin' : 'employee',
    };
    if (v.password) body.password = v.password;
    if (editing && Number(id) === user.id) delete body.role;

    setSaving(true);
    try {
      const saved = await api(editing ? `/employees/${id}` : '/employees', { method: editing ? 'PUT' : 'POST', body });
      notify(editing ? 'Employee updated' : `${saved.name} registered successfully`);
      navigate(editing ? `/admin/employees/${id}` : '/admin/adminDasboard');
    } catch (err) {
      setError(err.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Shell>
      <div className="page bg-indigo">
        <div className="reg-wrap">
          <form className="reg-card" onSubmit={submit} noValidate>
            <div className="center" style={{ paddingTop: 8 }}>
              <BackPill to={editing ? `/admin/employees/${id}` : '/admin/adminDasboard'} variant="solid" />
            </div>
            <h1 className="reg-title">{editing ? 'Edit Employee' : 'Registration Page'}</h1>
            <p className="reg-sub">{editing ? 'Update the employee details below' : 'Register a new employee below'}</p>
            {error && <div className="page-msg err">{error}</div>}

            <div className="reg-grid">
              <div>
                <label className="reg-label" htmlFor="r-name">Name:</label>
                <input id="r-name" className="reg-input" placeholder="Enter your name" value={v.name} onChange={set('name')} />
              </div>
              <div>
                <label className="reg-label" htmlFor="r-email">Email:</label>
                <input id="r-email" className="reg-input" type="email" placeholder="Enter your email" value={v.email} onChange={set('email')} autoComplete="off" />
              </div>
              <div>
                <label className="reg-label" htmlFor="r-pw">Password:</label>
                <div className="pw-field">
                  <input
                    id="r-pw" className="reg-input" type={showPw ? 'text' : 'password'} autoComplete="new-password"
                    placeholder={editing ? 'Leave blank to keep current password' : 'Enter password'} value={v.password} onChange={set('password')}
                  />
                  <button type="button" className="pw-eye" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? 'Hide password' : 'Show password'}>
                    {showPw ? <EyeOff size={22} /> : <Eye size={22} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="reg-label" htmlFor="r-role">Role:</label>
                <select id="r-role" className="reg-input" value={v.roleChoice} onChange={set('roleChoice')}>
                  <option value="">-- Choose Role --</option>
                  {roleOptions.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="reg-label" htmlFor="r-join">Joining Date:</label>
                <input id="r-join" className="reg-input" type="date" value={v.joining_date} onChange={set('joining_date')} />
              </div>
              <div>
                <label className="reg-label" htmlFor="r-phone">Contact Number:</label>
                <input id="r-phone" className="reg-input" type="tel" placeholder="Enter contact number" value={v.phone} onChange={set('phone')} />
              </div>
              <div>
                <label className="reg-label" htmlFor="r-salary">Current Salary:</label>
                <input id="r-salary" className="reg-input" type="number" min="0" placeholder="Enter current salary" value={v.salary} onChange={set('salary')} />
              </div>
              <div />
              <div className="full">
                <label className="reg-label" htmlFor="r-addr">Address:</label>
                <textarea id="r-addr" className="reg-input" placeholder="Enter your address" value={v.address} onChange={set('address')} />
              </div>
              <div className="full">
                <label className="reg-label">Company Resources:</label>
                {v.resources.map((r, i) => (
                  <div className="res-row" key={i}>
                    <input className="reg-input" placeholder="Resource (e.g. Laptop)" aria-label="Resource name" value={r.name || ''} onChange={setRes(i, 'name')} />
                    <input className="reg-input" placeholder="Resource ID (e.g. #PD12)" aria-label="Resource ID" value={r.code || ''} onChange={setRes(i, 'code')} />
                    <input className="reg-input" type="date" aria-label="Resource end date" title="End date" value={r.endDate || ''} onChange={setRes(i, 'endDate')} />
                    <select className="reg-input" aria-label="Resource status" value={r.status || 'provided'} onChange={setRes(i, 'status')}>
                      <option value="provided">provided</option>
                      <option value="returned">returned</option>
                      <option value="lost">lost</option>
                    </select>
                    <button type="button" className="res-remove" aria-label="Remove resource" onClick={() => setV((s) => ({ ...s, resources: s.resources.filter((_, j) => j !== i) }))}>
                      <X size={20} />
                    </button>
                  </div>
                ))}
                <button type="button" className="btn-add-resource" onClick={() => setV((s) => ({ ...s, resources: [...s.resources, { name: '', code: '', endDate: '', status: 'provided' }] }))}>
                  Add Resource
                </button>
              </div>
              <div>
                <label className="reg-label">Profile Image:</label>
                <FileBox value={v.photo} folder="profiles" accept="image/*" onChange={(url) => setV((s) => ({ ...s, photo: url }))} />
              </div>
              <div>
                <label className="reg-label">File Upload:</label>
                <FileBox value={v.document} folder="employee-files" onChange={(url) => setV((s) => ({ ...s, document: url }))} />
              </div>
              <div>
                <label className="reg-label" htmlFor="r-end">Ending Date:</label>
                <input id="r-end" className="reg-input" type="date" value={v.ending_date} onChange={set('ending_date')} />
              </div>
              <div>
                <label className="reg-label" htmlFor="r-rem">Remarks:</label>
                <input id="r-rem" className="reg-input" value={v.remarks} onChange={set('remarks')} />
              </div>
            </div>

            <button className="btn-register" disabled={saving}>{saving ? 'Saving…' : editing ? 'Update' : 'Register'}</button>
          </form>
        </div>
      </div>
    </Shell>
  );
}
