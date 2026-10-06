import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
];

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
  const [tab, setTab] = useState('profiles');
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
          </div>
        </section>
      </div>

    </Shell>
  );
}
