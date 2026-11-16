import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Shell from '../components/Shell';
import { BackPill } from '../components/Bits';
import { api } from '../api';
import { useApp } from '../AppContext';

// /admin/resetPassword (quick action): the admin enters the employee's email and a new password.
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
  const [target, setTarget] = useState(''); // employee email (Reset Password quick action)
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
        setPeople(list);
      }).catch(() => {});
    }
  }, [id]);

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    if (!id && isEmail && !name.trim()) return setMsg({ err: 'Please enter the employee name.' });
    if (!id && !isEmail && !target.trim()) return setMsg({ err: 'Please enter the employee email.' });
    if (!id && !isEmail && !/^\S+@\S+\.\S+$/.test(target.trim())) return setMsg({ err: 'Please enter a valid employee email.' });
    if (!isEmail && password.length < 6) return setMsg({ err: 'Password must be at least 6 characters.' });
    if (!isEmail && password !== confirm) return setMsg({ err: 'Passwords do not match.' });
    setBusy(true);
    try {
      const who = id ? { id } : isEmail ? { name: name.trim() } : { email: target.trim() };
      const r = isEmail
        ? await api('/employees/reset-email', { method: 'POST', body: { ...who, newEmail: email } })
        : await api('/employees/reset-password', { method: 'POST', body: { ...who, newPassword: password } });
      notify(r.message);
      navigate(back);
    } catch (err) {
      setMsg({ err: err.message });
    } finally {
      setBusy(false);
    }
  }

  const showName = isEmail; // password: employee email box from the quick action, nothing extra from a profile
  const wanted = target.trim().toLowerCase();
  const match = people.find((p) => p.email?.toLowerCase() === wanted);

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
                <label className="mint-label" htmlFor="m-target">Employee Email</label>
                <input
                  id="m-target" className="mint-input" type="email" placeholder="Enter employee email, e.g. ravi@company.com" list="employee-emails" autoComplete="off"
                  value={target} onChange={(e) => setTarget(e.target.value)}
                />
                <datalist id="employee-emails">{people.map((p) => <option key={p.id} value={p.email}>{p.name}</option>)}</datalist>
                {target.trim() && (
                  <div className={`mint-who${match ? '' : ' none'}`}>
                    {match ? <>Employee: <b>{match.name}</b> · {match.role === 'admin' ? 'Admin' : match.designation || 'Employee'}{match.emp_code ? ` · ${match.emp_code}` : ''}</> : 'No employee with this email yet'}
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
