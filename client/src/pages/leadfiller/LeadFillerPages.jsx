import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Building2, ClipboardList, FileText, Inbox, Info, Mail, MapPin, MessageSquare, Phone, PlusCircle, Reply, Search, Send, Users,
} from 'lucide-react';
import SalesShell, { LeadDetailModal, PRIORITY_TONE } from '../../components/SalesShell';
import { LeadCard } from '../sales/SalesDashboard';
import { Field } from '../../components/RecordModals';
import EmailConversation from '../../components/EmailConversation';
import { Loading } from '../../components/Bits';
import { api } from '../../api';
import { useApp } from '../../AppContext';
import { CONVERTED, NOT_CONVERTED, canCreate, canDelete, levelOf } from '../../access';
import { fmtDate } from '../../format';

export const LF = {
  home: '/leadfiller/dashboard',
  profile: '/leadfiller/viewprofile',
  enter: '/leadfiller/enterEnquiry',
  list: '/leadfiller/leadEnquiries',
  email: '/leadfiller/emailLeads',
};
// the same Email Leads / enquiry form screens inside the admin login
export const ADMIN_EMAIL = { email: '/admin/emailLeads', enter: '/admin/enterEnquiry', list: '/admin/records/leads' };
// Email Leads + enquiry form for the other logins; "list" is where each one views its enquiries
const SHARED_EMAIL = { email: '/emailLeads', enter: '/emailLeads/enquiry' };
const LIST_FOR = { sales: '/SaleteamDasboard/Dasboard', service: '/ServiceProject/Dashboard', employee: '/employee/records/leads' };
const pathsFor = (user) => {
  if (user?.role === 'admin') return ADMIN_EMAIL;
  if (user?.dashboard === 'leads') return LF;
  return { ...SHARED_EMAIL, list: LIST_FOR[user?.dashboard] || LIST_FOR.employee };
};

const CLOSED = [CONVERTED, NOT_CONVERTED];
const TABS = [['all', 'All'], ['assigned', 'Assigned'], ['quoted', 'Quoted'], ['closed', 'Closed']];
const inTab = (tab, l) =>
  tab === 'all' || (tab === 'assigned' && l.status === 'Assigned') || (tab === 'quoted' && l.status === 'Quoted') || (tab === 'closed' && CLOSED.includes(l.status));

function useLeads() {
  const { notify } = useApp();
  const [leads, setLeads] = useState(null);
  const load = useCallback(async () => {
    try {
      setLeads((await api('/records/leads?limit=2000')).items);
    } catch (e) {
      notify(e.message, 'error');
      setLeads([]);
    }
  }, [notify]);
  useEffect(() => { load(); }, [load]);
  return [leads, setLeads, load];
}

async function deleteLead(lead, notify, setLeads, close) {
  if (!confirm(`Delete enquiry ${lead.enqNo} (${lead.companyName})? This cannot be undone.`)) return;
  try {
    await api(`/records/leads/${lead.id}`, { method: 'DELETE' });
    notify('Enquiry deleted');
    close();
    setLeads((list) => list.filter((l) => l.id !== lead.id));
  } catch (e) {
    notify(e.message, 'error');
  }
}

/* ---------------- Dashboard ---------------- */
const ACTIONS = [
  { label: 'View Profile', icon: Users, tone: 'indigo', path: LF.profile },
  { label: 'Enter Enquiries', icon: PlusCircle, tone: 'green', path: LF.enter },
  { label: 'View Lead Enquiries', icon: ClipboardList, tone: 'blue', path: LF.list },
  { label: 'Email Leads', icon: Mail, tone: 'red', path: LF.email, needs: 'emailLeads' },
];

export function LeadFillerDashboard() {
  const navigate = useNavigate();
  const { user, notify } = useApp();
  const [leads, setLeads] = useLeads();
  const [tab, setTab] = useState('all');
  const [shown, setShown] = useState(12);
  const [open, setOpen] = useState(null);
  const level = levelOf(user, 'leads');

  const counts = useMemo(() => Object.fromEntries(TABS.map(([k]) => [k, (leads || []).filter((l) => inTab(k, l)).length])), [leads]);
  const filtered = useMemo(() => (leads || []).filter((l) => inTab(tab, l)), [leads, tab]);
  useEffect(() => { setShown(12); }, [tab]);

  const replace = (u) => setLeads((list) => list.map((l) => (l.id === u.id ? u : l)));
  const remove = canDelete(level) ? (lead) => deleteLead(lead, notify, setLeads, () => setOpen(null)) : null;

  return (
    <SalesShell subtitle="Analytics Dashboard" back={false}>
      <div className="sales-actions lf-actions">
        {ACTIONS.filter((a) => !a.needs || levelOf(user, a.needs)).map((a) => (
          <button key={a.label} className={`sa-btn c-${a.tone}`} onClick={() => navigate(a.path)}>
            <a.icon size={20} /> {a.label}
          </button>
        ))}
      </div>

      <section className="recent">
        <div className="recent-head">
          <div>
            <h2>Recent Enquiries</h2>
            <p>Enquiries you have entered, and where they are now</p>
          </div>
        </div>
        <div className="recent-tabs">
          {TABS.map(([k, label]) => (
            <button key={k} className={`rt ${k}${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{label} ({counts[k]})</button>
          ))}
        </div>
        {leads === null ? <Loading text="Loading enquiries…" /> : filtered.length === 0 ? (
          <div className="lf-empty">
            <span><Users size={44} /></span>
            <p>No enquiries found</p>
          </div>
        ) : (
          <>
            <div className="lead-grid">
              {filtered.slice(0, shown).map((l) => <LeadCard key={l.id} lead={l} onOpen={setOpen} onDelete={remove} />)}
            </div>
            {shown < filtered.length && (
              <div style={{ textAlign: 'center', marginTop: 30 }}>
                 <button className="show-more" onClick={() => setShown((n) => n + 12)}>Show more ({filtered.length - shown} more)</button>
              </div>
            )}
          </>
        )}
      </section>
      {open && <LeadDetailModal lead={open} onClose={() => setOpen(null)} onDelete={remove} onChanged={(u) => { replace(u); setOpen(u); }} />}
    </SalesShell>
  );
}

/* ---------------- Enter Enquiries -> "Sales Head Enquiry" form ---------------- */
const SECTIONS = [
  { name: 'Lead Details', icon: Building2, tone: 'blue' },
  { name: 'Contact Details', icon: Phone, tone: 'green' },
  { name: 'Address Details', icon: MapPin, tone: 'purple' },
  { name: 'Additional Information', icon: Info, tone: 'amber' },
];

const blankEnquiry = (fields) => Object.fromEntries(fields.map((f) => [f.key, '']));

export function EnterEnquiryPage() {
  const { modules, notify, user } = useApp();
  const P = pathsFor(user);
  const navigate = useNavigate();
  const location = useLocation();
  // Coming from Email Leads: { prefill: {...}, emailLeadId, subject }
  const fromEmail = location.state?.emailLeadId ? location.state : null;
  const mod = modules?.leads;
  const fields = useMemo(() => (mod ? mod.fields.filter((f) => f.section && !f.hidden) : []), [mod]);
  const [values, setValues] = useState(() => ({ ...blankEnquiry(fields), country: 'India', ...(fromEmail?.prefill || {}) }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);
  const set = (k) => (v) => setValues((s) => ({ ...s, [k]: v }));

  if (!mod) return <SalesShell subtitle="Enter Enquiries"><Loading /></SalesShell>;

  async function submit(e) {
    e.preventDefault();
    setError('');
    const missing = fields.filter((f) => f.required && !String(values[f.key] ?? '').trim());
    if (missing.length) return setError(`Please fill: ${missing.map((f) => f.formLabel || f.label).join(', ')}`);
    setSaving(true);
    try {
      const body = { ...values, ...(fromEmail ? { emailLeadId: String(fromEmail.emailLeadId) } : {}) };
      const saved = await api('/records/leads', { method: 'POST', body });
      notify(`Enquiry ${saved.enqNo} submitted`);
      if (fromEmail) return navigate(P.email, { replace: true, state: { converted: saved.enqNo } });
      setDone(saved);
      setValues({ ...blankEnquiry(fields), country: 'India' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SalesShell subtitle="Enter Enquiries">
      <form className="enq-card" onSubmit={submit} noValidate>
        <header className="enq-head">
          <h2>Sales Head Enquiry</h2>
          <p>Fill in the enquiry details and send it to a Sales Head</p>
        </header>
        <div className="enq-body">
          {fromEmail && (
            <div className="enq-note"><Mail size={18} /> From email: <b>{fromEmail.subject}</b> — check the details before submitting.</div>
          )}
          {done && (
            <div className="enq-ok">
              Enquiry <b>{done.enqNo}</b> submitted{done.salesHeadName ? ` to ${done.salesHeadName}` : ''}.
              <button type="button" onClick={() => navigate(P.list)}>View Lead Enquiries</button>
            </div>
          )}
          {error && <div className="form-error">{error}</div>}
          {SECTIONS.map((s) => {
            const list = fields.filter((f) => f.section === s.name);
            if (!list.length) return null;
            return (
              <fieldset key={s.name} className={`enq-sec t-${s.tone}`}>
                <legend><s.icon size={20} /> {s.name}</legend>
                <div className="enq-grid">
                  {list.map((f) => <Field key={f.key} f={f} value={values[f.key]} onChange={set(f.key)} moduleKey="leads" record={null} />)}
                </div>
              </fieldset>
            );
          })}
          <div className="enq-submit">
            <button type="submit" className="enq-btn" disabled={saving}><Send size={18} /> {saving ? 'Submitting…' : 'Submit Enquiry'}</button>
          </div>
        </div>
      </form>
    </SalesShell>
  );
}

/* ---------------- View Lead Enquiries ---------------- */
export function LeadFillerEnquiries() {
  const navigate = useNavigate();
  const { user, notify } = useApp();
  const [leads, setLeads] = useLeads();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState(null);
  const level = levelOf(user, 'leads');

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (leads || []).filter((l) => {
      if (!inTab(tab, l)) return false;
      const day = (l.createdAt || '').slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (!needle) return true;
      return [l.enqNo, l.companyName, l.customerName, l.phone, l.email, l.city, l.source, l.salesHeadName, l.status]
        .some((v) => String(v || '').toLowerCase().includes(needle));
    });
  }, [leads, q, tab, from, to]);

  const replace = (u) => setLeads((list) => list.map((l) => (l.id === u.id ? u : l)));
  const remove = canDelete(level) ? (lead) => deleteLead(lead, notify, setLeads, () => setOpen(null)) : null;

  return (
    <SalesShell subtitle="Lead Enquiries">
      <section className="sp-panel">
        <header>
          <h2><ClipboardList size={30} /> Lead Enquiries</h2>
          <div className="sp-actions">
            <button className="sp-btn b-green" onClick={() => navigate(LF.enter)}><PlusCircle size={18} /> Enter Enquiry</button>
          </div>
        </header>
        <div className="sp-content">
          <div className="lf-filters">
            <div className="sp-search" style={{ margin: 0, flex: 1 }}>
              <Search size={22} />
              <input placeholder="Search by company, contact, phone, enquiry no…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search enquiries" />
            </div>
            <label>From <input type="date" className="inp" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>To <input type="date" className="inp" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
          <div className="recent-tabs" style={{ margin: '20px 0' }}>
            {TABS.map(([k, label]) => (
              <button key={k} className={`rt ${k}${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>
                {label} ({(leads || []).filter((l) => inTab(k, l)).length})
              </button>
            ))}
          </div>
          {leads === null ? <div className="sp-loading">Loading enquiries…</div> : (
            <div className="sp-table-wrap flush">
              <table className="sp-table">
                <thead>
                  <tr><th>Enquiry No</th><th>Company</th><th>Contact</th><th>Mobile</th><th>Medium</th><th>Priority</th><th>Type</th><th>Sales Head</th><th>Stage</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={10} className="sp-none">No enquiries found</td></tr>
                  ) : rows.map((l) => (
                    <tr key={l.id} className="clickable" onClick={() => setOpen(l)}>
                      <td className="b nowrap">{l.enqNo}</td>
                      <td>{l.companyName}</td>
                      <td>{l.customerName}</td>
                      <td className="nowrap">{l.phone}</td>
                      <td>{l.source || '—'}</td>
                      <td>{l.priority ? <span className={`prio ${PRIORITY_TONE[l.priority] || ''} sm`}>{l.priority}</span> : '—'}</td>
                      <td>{l.category || '—'}</td>
                      <td>{l.salesHeadName || '—'}</td>
                      <td className="nowrap"><span className={`stage-pill sm s-${(l.status || '').replace(/[^a-z]/gi, '').toLowerCase()}`}>{l.status}</span></td>
                      <td className="nowrap">{fmtDate(l.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {leads !== null && <div className="sp-foot">Showing {rows.length} of {leads.length} enquiries</div>}
        </div>
      </section>
      {open && <LeadDetailModal lead={open} onClose={() => setOpen(null)} onDelete={remove} onChanged={(u) => { replace(u); setOpen(u); }} />}
    </SalesShell>
  );
}

/* ---------------- Email Leads -> "Email Lead Intelligence Dashboard" ---------------- */
const EMAIL_TABS = [['new', 'New'], ['converted', 'Converted'], ['ignored', 'Ignored']];
const CONNECT_RESULT = {
  connected: ['Gmail connected', 'success'],
  denied: ['Gmail access was not granted', 'error'],
  expired: ['The Gmail sign-in took too long. Please try again.', 'error'],
  failed: ['Could not connect Gmail. Check the Google settings in server/.env (see README).', 'error'],
};
// Google's error codes, in plain words
const REASON_HINT = {
  redirect_uri_mismatch: 'Add the redirect address shown on this page under Authorized redirect URIs of the OAuth client in Google Cloud.',
  invalid_client: 'The Client ID / secret in server/.env do not match an OAuth client in Google Cloud. Copy both again.',
  unauthorized_client: 'The Client ID / secret in server/.env do not match an OAuth client in Google Cloud. Copy both again.',
  invalid_grant: 'The sign-in expired or was used twice. Click Connect Gmail again.',
  access_denied: 'Access was not allowed. If the app is in Testing, add this Gmail address under OAuth consent screen > Test users.',
};
const when = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export function EmailLeadsPage({ admin = false }) {
  const { notify, user } = useApp();
  const P = pathsFor(user);
  const mayEnquire = canCreate(levelOf(user, 'leads')); // turning an email into an enquiry needs lead-create access
  const scope = admin ? '?scope=all' : '';
  const [inbox, setInbox] = useState(''); // admin: show one inbox only
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState(null);
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState('new');
  const [busy, setBusy] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [talking, setTalking] = useState(null); // email lead whose conversation / reply box is open
  const [skipped, setSkipped] = useState(null); // emails the last scan did not pick up, and why

  const loadStatus = useCallback(() => api(`/gmail/status${scope}`).then(setStatus).catch((e) => notify(e.message, 'error')), [notify, scope]);
  const loadItems = useCallback(() => api(`/gmail/leads${scope}`).then(setItems).catch((e) => { notify(e.message, 'error'); setItems([]); }), [notify, scope]);

  useEffect(() => {
    loadStatus();
    loadItems();
  }, [loadStatus, loadItems]);

  // back from Google (?gmail=connected) or from the enquiry form (state.converted)
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const result = q.get('gmail');
    if (result && CONNECT_RESULT[result]) {
      const reason = q.get('reason');
      const hint = REASON_HINT[reason] || (reason ? `Google said: ${reason}` : '');
      notify(hint && result !== 'connected' ? `${CONNECT_RESULT[result][0]}. ${hint}` : CONNECT_RESULT[result][0], CONNECT_RESULT[result][1]);
      navigate(P.email, { replace: true });
    } else if (location.state?.converted) {
      setTab('converted');
      navigate(P.email, { replace: true, state: null });
    }
  }, [location.search, location.state, navigate, notify, P.email]);

  async function connect() {
    setBusy('connect');
    try {
      const { url } = await api('/gmail/auth-url');
      window.location.assign(url);
    } catch (e) {
      notify(e.message, 'error');
      setBusy('');
    }
  }

  async function disconnect() {
    if (!confirm('Disconnect this Gmail account? Leads already found stay here.')) return;
    try {
      await api('/gmail/disconnect', { method: 'POST' });
      notify('Gmail disconnected');
      loadStatus();
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  async function scan() {
    setBusy('scan');
    try {
      const r = admin && status?.inboxes?.length
        ? await api('/gmail/scan-all', { method: 'POST', body: { days: 30 } })
        : await api('/gmail/scan', { method: 'POST', body: { days: 30 } });
      notify(r.message, 'success');
      setSkipped(r.skipped || []);
      setTab(r.registered || r.replies ? 'converted' : 'new');
      await Promise.all([loadItems(), loadStatus()]);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function importSkipped(x) {
    try {
      const r = await api('/gmail/import', { method: 'POST', body: { messageId: x.messageId, userId: x.userId } });
      notify(r.message, 'success');
      setSkipped((l) => l.filter((y) => y.messageId !== x.messageId));
      await Promise.all([loadItems(), loadStatus()]);
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  async function setLeadStatus(item, next) {
    try {
      const u = await api(`/gmail/leads/${item.id}`, { method: 'PATCH', body: { status: next } });
      setItems((list) => list.map((x) => (x.id === u.id ? { ...x, ...u } : x)));
      loadStatus();
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  function toEnquiry(item) {
    const domainCompany = item.company || '';
    navigate(P.enter, {
      state: {
        emailLeadId: item.id,
        subject: item.subject,
        prefill: {
          companyName: domainCompany,
          customerName: item.fromName || '',
          source: 'Email',
          priority: item.priority || '',
          category: item.category || '',
          condition: 'New Customer',
          phone: item.phone || '',
          email: item.fromEmail || '',
          city: item.city || '',
          country: 'India',
          requirement: `${item.subject}\n\n${item.body || item.snippet || ''}`.trim().slice(0, 2000),
        },
      },
    });
  }

  const inScope = (items || []).filter((x) => !inbox || x.inbox === inbox);
  const shown = inScope.filter((x) => x.status === tab);
  const tabCount = (k) => (admin ? inScope.filter((x) => x.status === k).length : status?.counts?.[k] ?? 0);
  const authenticated = status?.connected;

  return (
    <SalesShell subtitle={admin ? 'Email Leads (all inboxes)' : 'Email Leads'}>
      <section className="el-card">
        <header className="el-head">
          <div>
            <h2>Email Lead Intelligence Dashboard</h2>
            <p>{admin
              ? 'Enquiries found in every connected Gmail inbox. New ones are registered as Lead Enquiries automatically.'
              : 'Scan Gmail inbox and extract potential business leads'}</p>
          </div>
        </header>
        <div className="el-status">
          {!status ? <span className="muted">Checking Gmail…</span> : (
            <div className="el-lines">
              <p>
                <b>{admin ? 'Your Gmail:' : 'Status:'}</b>{' '}
                {authenticated
                  ? <span className="ok">Authenticated ({status.email})</span>
                  : <span className="no">Not connected{admin && status.inboxes?.length ? ' (the inboxes below are still read)' : ''}</span>}
                {authenticated && <button className="el-link" onClick={disconnect}>Disconnect</button>}
              </p>
              <p><b>Salesheads:</b> {status.salesHeads} available</p>
              {status.lastScanAt && <p className="muted">Last scan: {when(status.lastScanAt)}</p>}
              {authenticated && !status.canSend && (
                <p className="el-warn">Replies from the CRM need permission to send email: click <b>Connect Gmail</b> again and allow “Send email on your behalf”.</p>
              )}
              {status.configured && status.syncMinutes > 0 && (
                <p className="muted">
                  Connected inboxes are checked every {status.syncMinutes} min{status.autoRegister ? '; each new enquiry is added to Lead Enquiries with a draft quotation, and the team is notified' : ''}.
                </p>
              )}
              {admin && status.inboxes && (
                <p><b>Connected inboxes:</b>{' '}
                  {status.inboxes.length === 0 ? <span className="muted">none yet</span> : status.inboxes.map((b) => (
                    <span key={b.userId} className="el-inbox">{b.email} <i>({b.name} · {b.role}{b.lastScanAt ? ` · checked ${when(b.lastScanAt)}` : ''})</i></span>
                  ))}
                </p>
              )}
              {status.mock && <p className="muted">Demo mode (GMAIL_MOCK=1): scanning a sample inbox.</p>}
            </div>
          )}
          <div className="el-buttons">
            <button className="el-btn connect" onClick={connect} disabled={!status || busy !== ''}>
              <Mail size={18} /> {busy === 'connect' ? 'Opening Google…' : authenticated ? 'Change Gmail Account' : 'Connect Gmail'}
            </button>
            <button className="el-btn scan" onClick={scan} disabled={!(authenticated || (admin && status?.inboxes?.length)) || busy !== ''}>
              <Inbox size={18} /> {busy === 'scan' ? 'Scanning…' : admin && status?.inboxes?.length ? 'Scan All Inboxes' : 'Scan Inbox'}
            </button>
          </div>
        </div>
        {status && status.configured && !status.setupProblem && (
          <div className="el-hint">
            Google will ask <b>which account</b> to use: pick the Gmail that receives your customers' enquiries. While the Google app is in
            Testing, that Gmail must be added under <b>OAuth consent screen → Test users</b>.
          </div>
        )}
        {status && status.configured && status.setupProblem && <div className="el-setup">{status.setupProblem}</div>}
        {status && status.configured && !status.setupProblem && !status.connected && status.redirectUri && (
          <div className="el-hint">
            Google Cloud setup: this address must be listed under <b>Authorized redirect URIs</b> of the OAuth client:{' '}
            <code>{status.redirectUri}</code>
          </div>
        )}
        {status && !status.configured && (
          <div className="el-setup">
            Gmail isn't set up on the server yet. Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to
            {' '}<code>server/.env</code> (steps in the README), or set <code>GMAIL_MOCK=1</code> to try it with a sample inbox.
          </div>
        )}
      </section>

      {skipped && skipped.length > 0 && (
        <section className="el-skipped">
          <header>
            <b>Not picked up in the last scan ({skipped.length})</b>
            <span>These emails did not look like enquiries. If one is, click <b>Add as lead</b>.</span>
            <button className="el-link" onClick={() => setSkipped(null)}>Hide</button>
          </header>
          <ul>
            {skipped.map((x) => (
              <li key={x.messageId}>
                <div>
                  <b>{x.subject || '(no subject)'}</b>
                  <small>{x.from}{x.inbox ? ` · inbox ${x.inbox}` : ''} · {when(x.receivedAt)}</small>
                  <em>{x.reason}</em>
                </div>
                {!/same Gmail account/.test(x.reason) && <button className="el-small ghost" onClick={() => importSkipped(x)}>Add as lead</button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="recent-tabs el-tabs">
        {EMAIL_TABS.map(([k, label]) => (
          <button key={k} className={`rt ${k === 'new' ? 'all' : k === 'converted' ? 'closed' : 'quoted'}${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>
            {label} ({tabCount(k)})
          </button>
        ))}
        {admin && status?.inboxes?.length > 1 && (
          <select className="sel el-inbox-pick" value={inbox} onChange={(e) => setInbox(e.target.value)} aria-label="Inbox">
            <option value="">All inboxes</option>
            {status.inboxes.map((b) => <option key={b.userId} value={b.email}>{b.email} ({b.name})</option>)}
          </select>
        )}
      </div>

      {items === null ? <Loading text="Loading leads…" /> : shown.length === 0 ? (
        <div className="el-empty">
          {tab === 'new' ? (status?.autoRegister ? 'No unhandled emails. New enquiries are registered automatically (see Converted); click Scan Inbox to check now.' : 'No leads found. Click Scan Inbox to begin.') : tab === 'converted' ? 'No emails turned into enquiries yet.' : 'No ignored emails.'}
        </div>
      ) : (
        <div className="el-list">
          {shown.map((x) => (
            <article key={x.id} className="el-item">
              <div className="el-top">
                <div style={{ minWidth: 0 }}>
                  <h3>{x.subject}</h3>
                  <p className="from">{x.fromName ? `${x.fromName} · ` : ''}{x.fromEmail} · {when(x.receivedAt)}</p>
                  {admin && x.inbox && <p className="from">Inbox: {x.inbox}{x.inboxOwner ? ` (${x.inboxOwner})` : ''}</p>}
                </div>
                <div className="el-tags">
                  <span className="score" title="How strongly this email looks like an enquiry">Score {x.score}</span>
                  {x.priority && <span className={`prio sm ${PRIORITY_TONE[x.priority] || ''}`}>{x.priority}</span>}
                  {x.category && <span className={`cat sm ${x.category === 'Service' ? 'svc' : ''}`}>{x.category}</span>}
                </div>
              </div>
              <div className="el-facts">
                <span><Building2 size={16} /> {x.company || '—'}</span>
                <span><Phone size={16} /> {x.phone || '—'}</span>
                <span><MapPin size={16} /> {x.city || '—'}</span>
              </div>
              <p className={`el-body${expanded === x.id ? ' open' : ''}`}>{expanded === x.id ? x.body || x.snippet : x.snippet || x.body}</p>
              {x.reasons?.length > 0 && <div className="el-reasons">{x.reasons.map((r) => <span key={r}>{r}</span>)}</div>}
              <footer>
                <button className="el-link" onClick={() => setExpanded(expanded === x.id ? null : x.id)}>{expanded === x.id ? 'Show less' : 'Read email'}</button>
                {x.replies > 0 && <span className="el-replied"><MessageSquare size={14} /> {x.replies} repl{x.replies === 1 ? 'y' : 'ies'} sent{x.lastReplyAt ? ` · last ${when(x.lastReplyAt)}` : ''}</span>}
                <span style={{ flex: 1 }} />
                {x.status !== 'ignored' && <button className="el-small reply" onClick={() => setTalking(x)}><Reply size={16} /> Reply</button>}
                {x.status === 'new' && (
                  <>
                    <button className="el-small ghost" onClick={() => setLeadStatus(x, 'ignored')}>Ignore</button>
                    {mayEnquire && <button className="el-small go" onClick={() => toEnquiry(x)}><FileText size={16} /> Create Enquiry</button>}
                  </>
                )}
                {x.status === 'ignored' && <button className="el-small ghost" onClick={() => setLeadStatus(x, 'new')}>Restore</button>}
                {x.status === 'converted' && <span className="el-done">Enquiry {x.leadEnqNo || 'created'}{x.auto ? ' · registered automatically' : ''}</span>}
              </footer>
            </article>
          ))}
        </div>
      )}
      {talking && <EmailConversation emailLeadId={talking.id} onClose={() => setTalking(null)} onSent={loadItems} />}
    </SalesShell>
  );
}
