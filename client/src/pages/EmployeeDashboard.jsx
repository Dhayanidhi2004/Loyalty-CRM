import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Shell, { DashBar } from '../components/Shell';
import { QuickButton, Loading } from '../components/Bits';
import RecordsPanel from '../components/RecordsPanel';
import { ProfileBody } from './EmployeeProfile';
import { employeeActions } from '../config';
import { api } from '../api';
import { useApp } from '../AppContext';

// Same design as the admin dashboard; the buttons and tabs depend on the login role
// (Sales Head, Engineer, Service Engineer, Sales Employee, Inventory Manager, Lead Filler, Stock Filler).
export default function EmployeeDashboard() {
  const { user, notify } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState('profile');
  const [profile, setProfile] = useState(null);
  const access = user.access || {};

  const tabs = [
    { key: 'profile', label: 'My Profile', cls: 'p-indigo', title: 'My Profile', sub: 'Your details and activity' },
    access.inventory && { key: 'inventory', label: 'Inventory', cls: 'p-blue', title: 'Inventory', sub: 'Current stock of all products' },
    access.leads && { key: 'leads', label: 'Lead Enquiries', cls: 'p-green', title: access.leads === 'all' ? 'Lead Enquiries' : 'My Lead Enquiries', sub: access.leads === 'all' ? 'All enquiries captured by the team' : 'Enquiries you have captured' },
  ].filter(Boolean);

  useEffect(() => {
    if (tab === 'profile') api(`/employees/${user.id}`).then(setProfile).catch((e) => notify(e.message, 'error'));
  }, [tab, user.id, notify]);

  const current = tabs.find((t) => t.key === tab) || tabs[0];

  return (
    <Shell tinted variant="dark">
      <DashBar subtitle={`${user.loginRole} Dashboard`} />
      <div className="dash-body">
        <section className="card corner">
          <h3 className="card-title">Quick Actions</h3>
          <div className="qa-grid">
            {employeeActions(user.access).map((a) => (
              <QuickButton key={a.label} label={a.label} tone={a.tone} onClick={() => navigate(a.path || `/employee/records/${a.to}`)} />
            ))}
          </div>
        </section>

        <section className="card tabs-card">
          <div className="pill-tabs" role="tablist">
            {tabs.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} className={`pill ${t.cls}${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="tab-panel">
            <h3>{current.title}</h3>
            <p className="sub">{current.sub}</p>
            {current.key === 'profile' && (profile ? <div className="card" style={{ marginBottom: 0 }}><ProfileBody data={profile} linkBase="/employee/records" /></div> : <Loading />)}
            {current.key === 'inventory' && <RecordsPanel moduleKey="inventory" compact />}
            {current.key === 'leads' && <RecordsPanel moduleKey="leads" compact />}
          </div>
        </section>
      </div>
    </Shell>
  );
}
