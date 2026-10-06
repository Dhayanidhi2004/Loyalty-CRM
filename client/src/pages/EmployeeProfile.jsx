import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Shell from '../components/Shell';
import { BackPill, Photo, Loading, toneStyle } from '../components/Bits';
import { api, fileUrl } from '../api';
import { useApp } from '../AppContext';
import { fmtDate, fmtMoney } from '../format';

const STAT_TONES = ['cyan', 'sky', 'violet', 'emerald', 'amber', 'blue', 'pink', 'rose', 'green', 'orange'];

// Profile details + activity counts. Used by admin (any employee) and by employees (themselves).
export function ProfileBody({ data, linkBase }) {
  const e = data.employee;
  const resources = Array.isArray(e.resources) ? e.resources : [];
  return (
    <>
      <div className="profile-head">
        <Photo user={e} />
        <div style={{ flex: 1, minWidth: 260 }}>
          <h3>{e.name}</h3>
          <div className="role">
            {e.designation || 'Employee'}
            {e.department ? ` · ${e.department}` : ''}
            {e.role === 'admin' && e.designation !== 'Administrator' ? ' · Admin' : ''}
          </div>
          <div className="kv">
            <div><span>Employee ID</span>{e.emp_code || '—'}</div>
            <div><span>Login Role</span>{e.loginRole || e.designation || '—'}</div>
            <div><span>Email</span>{e.email}</div>
            <div><span>Contact Number</span>{e.phone || '—'}</div>
            <div><span>Joining Date</span>{fmtDate(e.joining_date)}</div>
            <div><span>Ending Date</span>{fmtDate(e.ending_date)}</div>
            <div><span>Current Salary</span>{e.salary != null ? fmtMoney(e.salary) : '—'}</div>
            <div><span>Converted Leads</span>{data.convertedLeads}</div>
            <div><span>Address</span>{e.address || '—'}</div>
            <div><span>Remarks</span>{e.remarks || '—'}</div>
            <div><span>Document</span>{e.document ? <a className="file-link" href={fileUrl(e.document)} target="_blank" rel="noreferrer">Open file</a> : '—'}</div>
            <div><span>Status</span>{e.active ? 'Active' : 'Disabled'}</div>
          </div>
        </div>
      </div>

      <h3 className="card-title" style={{ marginTop: 34, fontSize: 20 }}>Company Resources</h3>
      {resources.length === 0 ? (
        <p style={{ color: '#6b7280', margin: 0, position: 'relative', zIndex: 1 }}>No company resources assigned.</p>
      ) : (
        <div className="stat-grid">
          {resources.map((r, i) => (
            <div key={i} className="stat" style={toneStyle(r.status === 'returned' ? 'sky' : r.status === 'lost' ? 'red' : 'green')}>
              <b style={{ fontSize: 18 }}>{r.name || 'Resource'}</b>
              <span style={{ fontWeight: 400, display: 'block' }}>{r.code || r.details || '—'}</span>
              <span style={{ fontWeight: 400, display: 'block', fontSize: 13 }}>{r.status || 'provided'}{r.endDate ? ` · ends ${fmtDate(r.endDate)}` : ''}</span>
            </div>
          ))}
        </div>
      )}

      <h3 className="card-title" style={{ marginTop: 34, fontSize: 20 }}>Activity</h3>
      <div className="stat-grid">
        {data.stats.map((s, i) => {
          const to = linkBase ? `${linkBase}/${s.module}${linkBase.startsWith('/admin') ? `?createdBy=${e.id}` : ''}` : null;
          const body = (<><b>{s.count}</b><span>{s.label}</span></>);
          return to ? (
            <Link key={s.module} to={to} className="stat" style={toneStyle(STAT_TONES[i % STAT_TONES.length])}>{body}</Link>
          ) : (
            <div key={s.module} className="stat" style={toneStyle(STAT_TONES[i % STAT_TONES.length])}>{body}</div>
          );
        })}
      </div>
    </>
  );
}

export default function EmployeeProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notify, user } = useApp();
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    api(`/employees/${id}`)
      .then(setData)
      .catch((e) => {
        notify(e.message, 'error');
        navigate('/admin/adminDasboard');
      });
  }, [id, notify, navigate]);
  useEffect(load, [load]);

  async function toggleActive() {
    try {
      await api(`/employees/${id}`, { method: 'PUT', body: { active: !data.employee.active } });
      notify(data.employee.active ? 'Account disabled' : 'Account enabled');
      load();
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  async function remove() {
    if (!confirm(`Delete ${data.employee.name}? Their records stay, but will show no owner.`)) return;
    try {
      await api(`/employees/${id}`, { method: 'DELETE' });
      notify('Employee deleted');
      navigate('/admin/adminDasboard');
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  const isSelf = data && data.employee.id === user.id;

  return (
    <Shell>
      <div className="page bg-soft" style={{ fontFamily: 'var(--font-ui)' }}>
        <div className="page-inner">
          <div className="head-row center-title">
            <div><BackPill to="/admin/adminDasboard" /></div>
            <h1 className="title-mgmt">Employee Profile</h1>
            <div />
          </div>
          <section className="card corner" style={{ marginTop: 40 }}>
            {data && (
              <div className="profile-actions" style={{ justifyContent: 'flex-end', marginBottom: 24, position: 'relative', zIndex: 1 }}>
                <Link className="btn btn-soft" to={`/admin/register/${id}`}>Edit</Link>
                <Link className="btn btn-soft" to={`/admin/resetEmail?id=${id}`}>Reset Email</Link>
                <Link className="btn btn-soft" to={`/admin/resetPassword?id=${id}`}>Reset Password</Link>
                {!isSelf && <button className="btn btn-soft" onClick={toggleActive}>{data.employee.active ? 'Disable' : 'Enable'}</button>}
                {!isSelf && <button className="btn btn-danger" onClick={remove}>Delete</button>}
              </div>
            )}
            {data ? <ProfileBody data={data} linkBase="/admin/records" /> : <Loading />}
          </section>
        </div>
      </div>
    </Shell>
  );
}
