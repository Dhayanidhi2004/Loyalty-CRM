import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail } from 'lucide-react';
import Shell, { DashBar } from '../components/Shell';
import { QuickButton, Photo, Loading } from '../components/Bits';
import RecordsPanel from '../components/RecordsPanel';
import { ADMIN_ACTIONS } from '../config';
import { api } from '../api';
import { useApp } from '../AppContext';

const TABS = [
  { key: 'profiles', label: 'View Profiles', cls: 'p-indigo', title: 'All Employee Profiles', sub: 'Browse all registered employees in the system' },
  { key: 'inventory', label: 'Inventory', cls: 'p-blue', title: 'Inventory', sub: 'Current stock of all products' },
  { key: 'leads', label: 'Lead Enquiries', cls: 'p-green', title: 'Lead Enquiries', sub: 'All enquiries captured by your team' },
  { key: 'email', label: 'Email Leads', cls: 'p-rose', title: 'Email Leads', sub: 'Enquiries received in the connected Gmail inboxes, newest first' },
];

const when = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const EMAIL_STATE = { new: 'Not handled', converted: 'Enquiry', ignored: 'Ignored' };

// Latest email leads from every inbox, on the admin dashboard itself.
function EmailLeadsTab() {
  const navigate = useNavigate();
  const { notify } = useApp();
  const [list, setList] = useState(null);
  useEffect(() => {
    api('/gmail/leads?scope=all').then(setList).catch((e) => { notify(e.message, 'error'); setList([]); });
  }, [notify]);
  if (list === null) return <Loading />;
  return (
    <>
      <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={() => navigate('/admin/emailLeads')}><Mail size={16} /> Open Email Leads</button>
      </div>
      {list.length === 0 ? (
        <div className="empty">No email leads yet. Open Email Leads and click Connect Gmail (or ask the Lead Filler to connect theirs).</div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>#</th><th>Received</th><th>From</th><th>Subject</th><th>Company</th><th>Phone</th><th>Type</th><th>Inbox</th><th>Status</th></tr></thead>
            <tbody>
              {list.slice(0, 25).map((x, i) => (
                <tr key={x.id} onClick={() => navigate('/admin/emailLeads')}>
                  <td>{i + 1}</td>
                  <td className="nowrap">{when(x.receivedAt)}</td>
                  <td>{x.fromName || x.fromEmail}<br /><small style={{ color: '#6b7280' }}>{x.fromEmail}</small></td>
                  <td className="clip">{x.subject}</td>
                  <td>{x.company || '—'}</td>
                  <td className="nowrap">{x.phone || '—'}</td>
                  <td>{x.category || '—'}</td>
                  <td>{x.inbox || '—'}</td>
                  <td className="nowrap">{x.status === 'converted' ? `Enquiry ${x.leadEnqNo || ''}` : EMAIL_STATE[x.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.length > 25 && <div className="result-count">Showing the latest 25 of {list.length}. Open Email Leads for all.</div>}
    </>
  );
}

function EmployeeProfiles() {
  const navigate = useNavigate();
  const { notify } = useApp();
  const [list, setList] = useState(null);

  useEffect(() => {
    api('/employees')
      .then(setList)
      .catch((e) => {
        notify(e.message, 'error');
        setList([]);
      });
  }, [notify]);

  return (
    <>
      {list === null ? (
        <Loading />
      ) : list.length === 0 ? (
        <div className="empty">No employees yet. Use “Add Employee” above.</div>
      ) : (
        <div className="profile-grid">
          {list.map((e) => (
            <div key={e.id} className="profile-card" onClick={() => navigate(`/admin/employees/${e.id}`)}>
              <Photo user={e} />
              <h4>{e.name}</h4>
              <div className="role">{e.designation || 'Employee'}</div>
              <div className="meta">
                ID: {e.emp_code || '—'}
                <br />
                {e.email}
                <br />
                {e.phone || '—'}
                {e.department && (<><br />{e.department}</>)}
              </div>
              {!e.active && <span className="chip-off">Disabled</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(() => (TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'profiles'));
  useEffect(() => {
    const t = params.get('tab');
    if (TABS.some((x) => x.key === t)) setTab(t);
  }, [params]);
  const [counts, setCounts] = useState({});
  useEffect(() => {
    // unhandled Gmail enquiries, shown on the Email Leads button
    api('/gmail/status?scope=all').then((s) => setCounts({ emailLeads: s.counts.new + s.counts.converted || null })).catch(() => {});
  }, []);
  const current = TABS.find((t) => t.key === tab);

  return (
    <Shell tinted variant="dark">
      <DashBar subtitle="Admin Dashboard" />
      <div className="dash-body">
        <section className="card corner">
          <h3 className="card-title">Quick Actions</h3>
          <div className="qa-grid">
            {ADMIN_ACTIONS.map((a) => (
              <QuickButton
                key={a.label}
                label={a.label}
                tone={a.tone}
                count={a.count ? counts[a.count] : undefined}
                onClick={() => navigate(a.path || `/admin/records/${a.to}`)}
              />
            ))}
          </div>
        </section>

        <section className="card tabs-card">
          <div className="pill-tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} className={`pill ${t.cls}${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="tab-panel">
            <h3>{current.title}</h3>
            <p className="sub">{current.sub}</p>
            {tab === 'profiles' && <EmployeeProfiles />}
            {tab === 'inventory' && <RecordsPanel moduleKey="inventory" compact />}
            {tab === 'leads' && <RecordsPanel moduleKey="leads" compact />}
            {tab === 'email' && <EmailLeadsTab />}
          </div>
        </section>
      </div>

    </Shell>
  );
}
