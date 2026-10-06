import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Shell from '../components/Shell';
import { BackPill } from '../components/Bits';
import { api } from '../api';
import { useApp } from '../AppContext';

// /admin/resetPassword (quick action): the admin enters the Employee ID (LOY-xxxxxx) and a new password.
// /admin/resetEmail and /admin/resetPassword?id=<employee> are opened from an employee's profile page.
export default function ResetPage({ mode }) {
  const isEmail = mode === 'email';
  const [params] = useSearchParams();
  const id = params.get('id');
  const navigate = useNavigate();
  const { notify } = useApp();
  const back = id ? `/admin/employees/${id}` : '/admin/adminDasboard';

  const [name, setName] = useState('');
  const [names, setNames] = useState([]);
  const [people, setPeople] = useState([]);
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (id) {
      api(`/employees/${id}`).then(({ employee }) => setName(employee.name)).catch(() => {});
    } else {
      api('/employees?includeAdmins=1').then((list) => {
        setNames([...new Set(list.map((e) => e.name))]);
        setPeople(list.filter((e) => e.emp_code));
      }).catch(() => {});
    }
  }, [id]);

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    if (!id && isEmail && !name.trim()) return setMsg({ err: 'Please enter the employee name.' });
    if (!id && !isEmail && !code.trim()) return setMsg({ err: 'Please enter the Employee ID.' });
    if (!isEmail && password.length < 6) return setMsg({ err: 'Password must be at least 6 characters.' });
    if (!isEmail && password !== confirm) return setMsg({ err: 'Passwords do not match.' });
    setBusy(true);
    try {
      const target = id ? { id } : isEmail ? { name: name.trim() } : { empCode: code.trim() };
      const r = isEmail
        ? await api('/employees/reset-email', { method: 'POST', body: { ...target, newEmail: email } })
        : await api('/employees/reset-password', { method: 'POST', body: { ...target, newPassword: password } });
      notify(r.message);
      navigate(back);
    } catch (err) {
      setMsg({ err: err.message });
    } finally {
      setBusy(false);
    }
  }

  const showName = isEmail; // password: Employee ID box from the quick action, nothing extra from a profile
  const wanted = code.trim().toUpperCase().replace(/^(\d+)$/, 'LOY-$1');
  const match = people.find((p) => p.emp_code?.toUpperCase() === wanted);

  return (
    <Shell>
      <div className="page bg-mint">
        <div className="mint-wrap">
          <form className="mint-card" onSubmit={submit} noValidate>
            <h2>{isEmail ? 'Reset Email' : 'Reset Password'}</h2>
            <BackPill to={back} />

            {showName && (
              <div className="mint-field">
                <label className="mint-label" htmlFor="m-name">Name</label>
                <input
                  id="m-name" className="mint-input" placeholder="Enter your name" list="employee-names" autoComplete="off"
                  value={name} onChange={(e) => setName(e.target.value)} readOnly={!!id}
                />
                <datalist id="employee-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
              </div>
            )}

            {!isEmail && !id && (
              <div className="mint-field">
                <label className="mint-label" htmlFor="m-code">Employee ID</label>
                <input
                  id="m-code" className="mint-input" placeholder="Enter employee ID, e.g. LOY-325332" list="employee-codes" autoComplete="off"
                  value={code} onChange={(e) => setCode(e.target.value)}
                />
                <datalist id="employee-codes">{people.map((p) => <option key={p.id} value={p.emp_code}>{p.name}</option>)}</datalist>
                {code.trim() && (
                  <div className={`mint-who${match ? '' : ' none'}`}>
                    {match ? <>Employee: <b>{match.name}</b> · {match.role === 'admin' ? 'Admin' : match.designation || 'Employee'} · {match.email}</> : 'No employee with this ID yet'}
                  </div>
                )}
              </div>
            )}

            {isEmail ? (
              <div className="mint-field">
                <label className="mint-label" htmlFor="m-email">Email</label>
                <input id="m-email" className="mint-input" type="email" placeholder="Enter your new email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            ) : (
              <>
                <div className="mint-field">
                  <label className="mint-label" htmlFor="m-pw">Password</label>
                  <input id="m-pw" className="mint-input" type="password" placeholder="Enter your new password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <div className="mint-field">
                  <label className="mint-label" htmlFor="m-cpw">Confirm Password</label>
                  <input id="m-cpw" className="mint-input" type="password" placeholder="Confirm your new password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                </div>
              </>
            )}

            <button className="btn-mint" disabled={busy}>{busy ? 'Please wait…' : isEmail ? 'Reset Email' : 'Reset Password'}</button>
            {msg?.err && <div className="page-msg err">{msg.err}</div>}
          </form>
        </div>
      </div>
    </Shell>
  );
}
