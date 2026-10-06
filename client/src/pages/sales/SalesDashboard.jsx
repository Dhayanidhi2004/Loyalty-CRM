import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, BarChart3, Boxes, Calendar, CheckCircle2, Eye, FileText, Mail, MapPin, Package, Phone, PieChart, Plus, Siren, TrendingUp, Users, XCircle,
} from 'lucide-react';
import SalesShell, { LeadDetailModal, PRIORITY_TONE } from '../../components/SalesShell';
import { RecordFormModal } from '../../components/RecordModals';
import { StatusBadge, Loading } from '../../components/Bits';
import { BarChart, Donut, LineChart, PALETTE } from '../../components/Charts';
import { api } from '../../api';
import { useApp } from '../../AppContext';
import { CONVERTED, LEAD_STAGES, NOT_CONVERTED, canCreate, canDelete, canEditAll, levelOf } from '../../access';

const CLOSED = [CONVERTED, NOT_CONVERTED];
const PRIORITIES = ['Hot', 'High', 'Warm', 'Low'];
const usDate = (v) => (v ? new Date(v).toLocaleDateString('en-US') : '—');

// Buttons across the top — same set and order as the original dashboard. Each shows only when the
// role can open it (roles.js); Product Requests appears for the Inventory Manager.
const ACTIONS = [
  { label: 'View Profile', icon: Users, tone: 'indigo', path: '/SaleteamDasboard/viewprofile' },
  { label: 'Customer Converted', icon: CheckCircle2, tone: 'green', path: '/SaleteamDasboard/customerConverted', needs: 'leads' },
  { label: 'Overall Customer', icon: Users, tone: 'blue', path: '/SaleteamDasboard/customers', needs: 'customers' },
  { label: 'Not Converted', icon: XCircle, tone: 'red', path: '/SaleteamDasboard/notConverted', needs: 'leads' },
  { label: 'Inventory', icon: Package, tone: 'purple', path: '/SaleteamDasboard/inventory', needs: 'inventory' },
  { label: 'Purchase Order', icon: FileText, tone: 'emerald', path: '/SaleteamDasboard/purchaseOrder', needs: 'poRequests' },
  { label: 'Proforma Invoice', icon: FileText, tone: 'amber', path: '/SaleteamDasboard/invoices', needs: 'pi' },
  { label: 'View Quotation', icon: FileText, tone: 'violet', path: '/SaleteamDasboard/quotations', needs: 'quotations' },
  { label: 'Product Requests', icon: Boxes, tone: 'red', path: '/SaleteamDasboard/productRequests', needs: 'productRequests' },
];

function StatCard({ label, value, note, icon: Icon, tone }) {
  return (
    <div className={`stat-card ${tone}`}>
      <div className="stat-top"><span>{label}</span><Icon size={24} /></div>
      <b>{value}</b>
      <small>{note}</small>
    </div>
  );
}

function ChartCard({ title, sub, icon: Icon, tone, children, wide }) {
  return (
    <section className={`chart-card${wide ? ' wide' : ''}`}>
      <header>
        <div>
          <h3 className={`c-${tone}`}>{title}</h3>
          <p>{sub}</p>
        </div>
        <span className={`chart-ic c-${tone}`}><Icon size={24} /></span>
      </header>
      {children}
    </section>
  );
}

export function LeadCard({ lead, onOpen, onQuote, onDelete }) {
  return (
    <article className="lead-card">
      <header>
        <div className="lc-top">
          <div style={{ minWidth: 0 }}>
            <h4>{lead.companyName || lead.customerName}</h4>
            <p>{lead.customerName}</p>
          </div>
          {lead.priority && <span className={`prio ${PRIORITY_TONE[lead.priority] || ''}`}>{lead.priority}</span>}
        </div>
        <div className="lc-bottom">
          <span className={`stage-pill s-${(lead.status || '').replace(/[^a-z]/gi, '').toLowerCase()}`}>{lead.status}</span>
          <span className="lc-enq">{lead.enqNo}</span>
        </div>
      </header>
      <div className="lc-body">
        <div className="lc-line"><Phone size={18} /><span>{lead.phone || '—'}</span>{lead.category && <span className={`cat ${lead.category === 'Service' ? 'svc' : ''}`}>{lead.category}</span>}</div>
        <div className="lc-line"><Mail size={18} /><span>{lead.email || '—'}</span></div>
        <div className="lc-line"><MapPin size={18} /><span>{[lead.city, lead.state].filter(Boolean).join(', ') || '—'}</span></div>
        <div className="lc-line"><Calendar size={18} /><span>{usDate(lead.createdAt)}</span></div>
        {lead.assignedToName && <div className="lc-line assigned"><Users size={18} /><span>Assigned to {lead.assignedToName}</span></div>}
      </div>
      <footer>
        <button className="lc-link" onClick={() => onOpen(lead)}><Eye size={18} /> View Full Details</button>
        <span style={{ flex: 1 }} />
        {onQuote && <button className="lc-icon" title="Create quotation" aria-label="Create quotation" onClick={() => onQuote(lead)}><FileText size={20} /></button>}
        {onDelete && <button className="lc-del" onClick={() => onDelete(lead)}>Delete</button>}
      </footer>
    </article>
  );
}

export default function SalesDashboard() {
  const navigate = useNavigate();
  const { user, modules, notify } = useApp();
  const level = levelOf(user, 'leads');
  // Sales Head (team view): hands out leads (Unassigned tab), adds enquiries, and their 2nd card is "Converted".
  // Sales Employee / Inventory Manager work the leads given to them: their 2nd card is "Closed" (won + lost)
  // and there is no New Enquiry button, as in the original.
  const teamView = canEditAll(level);
  const sells = canCreate(levelOf(user, 'quotations'));
  const [leads, setLeads] = useState(null);
  const [tab, setTab] = useState('all');
  const [prio, setPrio] = useState('');
  const [type, setType] = useState('');
  const [shown, setShown] = useState(12);
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const [quoting, setQuoting] = useState(null);

  const load = useCallback(async () => {
    try {
      setLeads((await api('/records/leads?limit=2000')).items);
    } catch (e) {
      notify(e.message, 'error');
      setLeads([]);
    }
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const L = leads || [];
    const won = L.filter((l) => l.status === CONVERTED).length;
    const lost = L.filter((l) => l.status === NOT_CONVERTED).length;
    const count = (key, values) => values.map((v) => L.filter((l) => l[key] === v).length);
    // enquiry types in the order of most used
    // Lead Medium is free text: group "phone call", "Phone Call " etc. together
    const types = {};
    L.forEach((l) => {
      const t = (l.source || '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) || 'Not set';
      types[t] = (types[t] || 0) + 1;
    });
    // last 30 days, local dates
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push(d);
    }
    const daily = days.map((d) => {
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      return {
        label: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        value: L.filter((l) => { const t = new Date(l.createdAt); return t >= d && t < next; }).length,
      };
    });
    return {
      total: L.length,
      won,
      lost,
      pending: L.length - won - lost,
      rate: L.length ? ((won / L.length) * 100).toFixed(1) : '0',
      stages: count('status', LEAD_STAGES),
      priorities: count('priority', PRIORITIES),
      unprioritised: L.filter((l) => !PRIORITIES.includes(l.priority)).length,
      types: Object.entries(types).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })),
      daily,
      tabs: {
        unassigned: L.filter((l) => !l.assignedTo && !CLOSED.includes(l.status)).length,
        all: L.length,
        assigned: L.filter((l) => l.status === 'Assigned').length,
        quoted: L.filter((l) => l.status === 'Quoted').length,
        closed: L.filter((l) => CLOSED.includes(l.status)).length,
      },
      active: L.filter((l) => !CLOSED.includes(l.status)).length,
    };
  }, [leads]);

  const filtered = useMemo(() => {
    const L = leads || [];
    return L.filter((l) => {
      if (tab === 'unassigned' && (l.assignedTo || CLOSED.includes(l.status))) return false;
      if (tab === 'assigned' && l.status !== 'Assigned') return false;
      if (tab === 'quoted' && l.status !== 'Quoted') return false;
      if (tab === 'closed' && !CLOSED.includes(l.status)) return false;
      if (prio && l.priority !== prio) return false;
      if (type && l.category !== type) return false;
      return true;
    });
  }, [leads, tab, prio, type]);

  useEffect(() => { setShown(12); }, [tab, prio, type]);

  async function remove(lead) {
    if (!confirm(`Delete enquiry ${lead.enqNo} (${lead.companyName})? This cannot be undone.`)) return;
    try {
      await api(`/records/leads/${lead.id}`, { method: 'DELETE' });
      notify('Enquiry deleted');
      setOpen(null);
      setLeads((list) => list.filter((l) => l.id !== lead.id));
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  const replace = (u) => setLeads((list) => list.map((l) => (l.id === u.id ? u : l)));
  const actions = ACTIONS.filter((a) => !a.needs || levelOf(user, a.needs));
  const mayQuote = sells;
  const typeOptions = modules?.leads?.fields.find((f) => f.key === 'category')?.options || [];

  const stageData = LEAD_STAGES.map((s, i) => ({ label: s, value: stats.stages[i], color: PALETTE.categorical[i] }));
  const prioData = [
    ...PRIORITIES.map((p, i) => ({ label: p, value: stats.priorities[i], color: PALETTE.priority[i] })),
    ...(stats.unprioritised ? [{ label: 'Not set', value: stats.unprioritised, color: '#9ca3af' }] : []),
  ];
  const convData = [
    { label: 'Converted (Closed: Won)', value: stats.won, color: PALETTE.status.good },
    { label: 'Pending', value: stats.pending, color: PALETTE.status.warning },
    { label: 'Not Converted (Closed: Lost)', value: stats.lost, color: PALETTE.status.critical },
  ];

  return (
    <SalesShell subtitle="Analytics Dashboard" back={false}>
      <div className="sales-actions">
        {actions.map((a) => (
          <button key={a.label} className={`sa-btn c-${a.tone}`} onClick={() => navigate(a.path)}>
            <a.icon size={20} /> {a.label}
          </button>
        ))}
      </div>

      {leads === null || !modules ? <Loading text="Loading analytics…" /> : (
        <>
          <div className="stat-row">
            <StatCard label="TOTAL LEADS" value={stats.total} note="All enquiries" icon={Users} tone="t-blue" />
            {teamView
              ? <StatCard label="CONVERTED" value={stats.won} note="Successful deals" icon={CheckCircle2} tone="t-green" />
              : <StatCard label="CLOSED" value={stats.won + stats.lost} note="Won + Lost deals" icon={CheckCircle2} tone="t-green" />}
            <StatCard label="PENDING" value={stats.pending} note="In progress" icon={Activity} tone="t-amber" />
            <StatCard label="CONV. RATE" value={`${stats.rate}%`} note="Success rate" icon={TrendingUp} tone="t-violet" />
          </div>

          <div className="chart-row three">
            <ChartCard title="Enquiry Stages" sub="Current pipeline status" icon={Activity} tone="indigo">
              <Donut data={stageData} />
            </ChartCard>
            <ChartCard title="Priority Levels" sub="Urgency distribution" icon={PieChart} tone="purple">
              <Donut data={prioData} />
            </ChartCard>
            <ChartCard title="Conversion Status" sub="Customer conversion tracking" icon={CheckCircle2} tone="green">
              <Donut data={convData} />
            </ChartCard>
          </div>

          <div className="chart-row two">
            <ChartCard title="Enquiry Type Distribution" sub="How leads are acquired - by channel/medium" icon={BarChart3} tone="green" wide>
              <BarChart data={stats.types} />
            </ChartCard>
            <ChartCard title="Daily Lead Trends" sub="Number of enquiries received each day" icon={TrendingUp} tone="blue" wide>
              <LineChart data={stats.daily} />
            </ChartCard>
          </div>

          <section className="recent">
            <div className="recent-head">
              <div>
                <h2>Recent Enquiries</h2>
                <p>Click any card to view full details</p>
              </div>
              <div className="recent-tools">
                <select className="pill-select" value={prio} onChange={(e) => setPrio(e.target.value)} aria-label="Filter by priority">
                  <option value="">All Priorities</option>
                  {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                </select>
                <select className="pill-select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by enquiry type">
                  <option value="">All Types</option>
                  {typeOptions.map((t) => <option key={t}>{t}</option>)}
                </select>
                <span className="active-badge">{stats.active} Active Leads</span>
                {teamView && canCreate(level) && <button className="new-lead" onClick={() => setAdding(true)}><Plus size={18} /> New Enquiry</button>}
              </div>
            </div>
            <div className="recent-tabs">
              {teamView && (
                <>
                  <button className={`rt unassigned${tab === 'unassigned' ? ' on' : ''}`} onClick={() => setTab('unassigned')}><Siren size={16} /> Unassigned ({stats.tabs.unassigned})</button>
                  <span className="rt-sep" />
                </>
              )}
              {[['all', 'All'], ['assigned', 'Assigned'], ['quoted', 'Quoted'], ['closed', 'Closed']].map(([k, label]) => (
                <button key={k} className={`rt ${k}${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{label} ({stats.tabs[k]})</button>
              ))}
            </div>
            {filtered.length === 0 ? (
              <div className="lf-empty">
                <span><Users size={44} /></span>
                <p>No enquiries found</p>
              </div>
            ) : (
              <>
                <div className="lead-grid">
                  {filtered.slice(0, shown).map((l) => (
                    <LeadCard key={l.id} lead={l} onOpen={setOpen}
                      onQuote={mayQuote ? setQuoting : null}
                      onDelete={canDelete(level) ? remove : null} />
                  ))}
                </div>
                {shown < filtered.length && (
                  <div style={{ textAlign: 'center', marginTop: 30 }}>
                    <button className="show-more" onClick={() => setShown((n) => n + 12)}>Show more ({filtered.length - shown} more)</button>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}

      {open && <LeadDetailModal lead={open} onClose={() => setOpen(null)} onDelete={remove} onChanged={(u) => { replace(u); setOpen(u); }} />}
      {adding && (
        <RecordFormModal moduleKey="leads" mod={modules.leads} record={{}} onClose={() => setAdding(false)}
          onSaved={(l) => { setAdding(false); setLeads((list) => [l, ...list]); }} />
      )}
      {quoting && (
        <RecordFormModal moduleKey="quotations" mod={modules.quotations}
          record={{ customerName: quoting.companyName || quoting.customerName, enquiryNo: quoting.enqNo, gst: 18 }}
          onClose={() => setQuoting(null)}
          onSaved={() => { setQuoting(null); notify('Quotation created — enquiry moved to Quoted'); load(); }} />
      )}
    </SalesShell>
  );
}
