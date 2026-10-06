import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Lock, Mail, RefreshCw } from 'lucide-react';
import Shell from '../components/Shell';
import Modal from '../components/Modal';
import { useApp } from '../AppContext';
import { api } from '../api';

import { homeFor } from '../access';

export { homeFor };

function SelfResetModal({ onClose }) {
  const [v, setV] = useState({ email: '', currentPassword: '', newPassword: '', confirm: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const bind = (k) => ({ value: v[k], onChange: (e) => setV((s) => ({ ...s, [k]: e.target.value })) });

  async function submit(e) {
    e.preventDefault();
    if (v.newPassword !== v.confirm) return setMsg({ err: 'New passwords do not match' });
    setBusy(true);
    try {
      const r = await api('/auth/reset-password', { method: 'POST', body: v });
      setMsg({ ok: r.message });
      setV({ email: v.email, currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      setMsg({ err: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Reset Password"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-soft" onClick={onClose}>Close</button>
          <button className="btn btn-green" form="self-reset" disabled={busy}>{busy ? 'Updating…' : 'Update Password'}</button>
        </>
      }
    >
      {msg?.err && <div className="form-error">{msg.err}</div>}
      {msg?.ok && <div className="form-ok">{msg.ok}</div>}
      <form id="self-reset" className="form-grid" onSubmit={submit}>
        <div className="fld full"><label>Email</label><input className="inp" type="email" required {...bind('email')} /></div>
        <div className="fld full"><label>Current Password</label><input className="inp" type="password" required {...bind('currentPassword')} /></div>
        <div className="fld"><label>New Password</label><input className="inp" type="password" minLength={6} required {...bind('newPassword')} /></div>
        <div className="fld"><label>Confirm New Password</label><input className="inp" type="password" required {...bind('confirm')} /></div>
      </form>
      <p className="hint" style={{ color: '#6b7280', fontSize: 13, marginBottom: 0 }}>Forgot your current password? Ask your admin to reset it.</p>
    </Modal>
  );
}

export default function Login() {
  const { user, ready, login } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showReset, setShowReset] = useState(false);

  if (ready && user) return <Navigate to={homeFor(user)} replace />;

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const u = await login(email.trim(), password);
      navigate(homeFor(u), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell variant="dark">
      <div className="login-wrap">
        <form className="login-card" onSubmit={submit}>
          <div className="lock-circle"><Lock size={38} strokeWidth={2.2} /></div>
          <h1>CRM Login</h1>
          {error && <div className="form-error">{error}</div>}
          <div className="login-field">
            <label htmlFor="email">Email</label>
            <div className="input-icon">
              <Mail size={21} />
              <input id="email" type="email" placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
            </div>
          </div>
          <div className="login-field">
            <label htmlFor="password">Password</label>
            <div className="input-icon">
              <Lock size={21} />
              <input id="password" type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </div>
          </div>
          <button className="btn-login" disabled={busy}>{busy ? 'Logging in…' : 'Login'}</button>
          <button type="button" className="btn-reset" onClick={() => setShowReset(true)}>
            <RefreshCw size={22} strokeWidth={2.4} /> Reset Password
          </button>
        </form>
      </div>
      {showReset && <SelfResetModal onClose={() => setShowReset(false)} />}
    </Shell>
  );
}
