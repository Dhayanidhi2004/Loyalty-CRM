import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Shell from '../../components/Shell';
import { LeadDetailModal } from '../../components/SalesShell';
import { api } from '../../api';
import { useApp } from '../../AppContext';
import { fmtDate } from '../../format';

export const SERVICE = {
  home: '/ServiceProject/Dashboard',
  profile: '/ServiceProject/viewprofile',
  inventory: '/ServiceProject/inventory',
  serviceDetails: '/employee/records/serviceDetails',
  workVisits: '/employee/records/workVisits',
};

const BUTTONS = [
  ['View Profile', SERVICE.profile],
  ['Inventory', SERVICE.inventory],
  ['Get Service Details', SERVICE.serviceDetails],
  ['Workvisits', SERVICE.workVisits],
];

// "Service Project Data": every enquiry whose Enquiry Type is Service (columns as on the original screen).
const COLUMNS = [
  ['Company Name', 'companyName'], ['Contact Person', 'customerName'], ['Department', 'department'], ['Lead Medium', 'source'],
  ['Lead Priority', 'priority'], ['Enquiry Type', 'category'], ['Lead Condition', 'condition'], ['Contact Number', 'phone'],
  ['Alternate Phone Number', 'altPhone'], ['Primary Mail', 'email'], ['Secondary Mail', 'altEmail'], ['Address', 'address'],
  ['City', 'city'], ['State', 'state'], ['Postal Code', 'postalCode'], ['Country', 'country'], ['Description', 'requirement'],
  ['Sales Head', 'salesHeadName'], ['Assigned To', 'assignedToName'], ['Stage', 'status'], ['Enquiry No', 'enqNo'], ['Date', 'createdAt'],
];

export default function ServiceDashboard() {
  const navigate = useNavigate();
  const { notify } = useApp();
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    api('/records/leads?limit=2000')
      .then((r) => setRows(r.items))
      .catch((e) => { notify(e.message, 'error'); setRows([]); });
  }, [notify]);

  return (
    <Shell variant="dark">
      <div className="sv-page">
        <section className="sv-card">
          <h1 className="sv-title">Dashboard</h1>
          <div className="sv-buttons">
            {BUTTONS.map(([label, path]) => (
              <button key={label} className="sv-btn" onClick={() => navigate(path)}>{label}</button>
            ))}
          </div>
          <div className="sv-panel">
            <div className="sv-data">
              <h2>Service Project Data</h2>
              <div className="sv-scroll">
                <table className="sv-table">
                  <thead>
                    <tr>{COLUMNS.map(([label]) => <th key={label}>{label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows !== null && rows.map((l) => (
                      <tr key={l.id} onClick={() => setOpen(l)} title="View full details">
                        {COLUMNS.map(([label, key]) => (
                          <td key={label} className={key === 'requirement' ? 'wrap' : ''}>
                            {key === 'createdAt' ? fmtDate(l.createdAt) : l[key] || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows === null && <p className="sv-none">Loading…</p>}
                {rows !== null && rows.length === 0 && <p className="sv-none">No sales enquiries available</p>}
              </div>
            </div>
          </div>
        </section>
      </div>
      {open && <LeadDetailModal lead={open} onClose={() => setOpen(null)} onChanged={(u) => setOpen(u)} />}
    </Shell>
  );
}
