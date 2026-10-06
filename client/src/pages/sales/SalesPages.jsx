import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Building2, ExternalLink, Eye, FileText, Mail, Package, Plus, Search, User } from 'lucide-react';
import { CREATE_PAGES, PiSheet } from '../create/CreateDocuments';
import SalesShell, { LeadDetailModal, SALES_HOME } from '../../components/SalesShell';
import { RecordFormModal, RecordViewModal } from '../../components/RecordModals';
import { Loading, StatusBadge } from '../../components/Bits';
import { InvoiceDetail, QuotationDetail, rupees } from '../CardPages';
import { api, fileUrl } from '../../api';
import { useApp } from '../../AppContext';
import { BRAND } from '../../config';
import { amountInWords, fmtDate, initials } from '../../format';
import { CONVERTED, NOT_CONVERTED, canCreate, canDelete, canEditRecord, levelOf } from '../../access';

const usDate = (v) => (v ? new Date(v).toLocaleDateString('en-US') : '—');
const money2 = (v) => `₹ ${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Loads one module's records with error / loading states (the original pages showed
// "Failed to fetch data from server" and endless spinners — these always resolve).
function useRecords(moduleKey, query = '') {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      setItems((await api(`/records/${moduleKey}?limit=2000${query}`)).items);
    } catch (e) {
      setError(e.message);
      setItems([]);
    }
  }, [moduleKey, query]);
  useEffect(() => { load(); }, [load]);
  return { items, setItems, error, load };
}

function Panel({ title, icon: Icon, actions, children }) {
  return (
    <section className="sp-panel">
      <header>
        <h2>{Icon && <Icon size={30} />}{title}</h2>
        {actions && <div className="sp-actions">{actions}</div>}
      </header>
      <div className="sp-content">{children}</div>
    </section>
  );
}

const State = ({ items, error, loadingText, emptyText, onRetry, children }) => {
  if (items === null) return <div className="sp-loading"><div className="spinner" />{loadingText}</div>;
  if (error) return <div className="sp-error">{error} <button className="lc-link" onClick={onRetry}>Try again</button></div>;
  if (!items.length) return <div className="sp-empty">{emptyText}</div>;
  return children;
};

/* -------------------------------- View Profile -------------------------------- */
export function SalesProfile() {
  const { user, notify } = useApp();
  const [me, setMe] = useState(null);
  useEffect(() => {
    api(`/employees/${user.id}`).then((r) => setMe(r)).catch((e) => notify(e.message, 'error'));
  }, [user.id, notify]);
  const e = me?.employee;
  const Box = ({ icon: Icon, label, children, full }) => (
    <div className={`pf-box${full ? ' full' : ''}`}><div className="pf-label"><Icon size={18} /> {label}</div><div className="pf-value">{children}</div></div>
  );
  return (
    <SalesShell subtitle="Profile">
      <section className="pf-card">
        <header className="pf-head">
          <h2>Profile Information</h2>
          <p>View your account details</p>
        </header>
        {!e ? <Loading /> : (
          <div className="pf-body">
            <div className="pf-avatar">
              {e.photo ? <img src={fileUrl(e.photo)} alt={e.name} /> : <span>{initials(e.name)}</span>}
              <i className={e.active ? 'on' : ''} title={e.active ? 'Active' : 'Disabled'} />
            </div>
            <div className="pf-grid">
              <Box icon={User} label="EMPLOYEE ID">{e.emp_code || '—'}</Box>
              <Box icon={User} label="FULL NAME">{e.name}</Box>
              <Box icon={Mail} label="EMAIL ADDRESS" full>{e.email}</Box>
              <Box icon={User} label="ROLE">{e.loginRole || e.designation || '—'}</Box>
              <Box icon={User} label="CONTACT NUMBER">{e.phone || '—'}</Box>
              <Box icon={FileText} label="UPLOADED DOCUMENT" full>
                {e.document ? (
                  <a className="pf-file" href={fileUrl(e.document)} target="_blank" rel="noreferrer"><FileText size={22} /> View Uploaded File <ExternalLink size={18} /></a>
                ) : <span className="muted">No document uploaded</span>}
              </Box>
            </div>
          </div>
        )}
      </section>
    </SalesShell>
  );
}

/* ----------------------- Customer Converted / Not Converted ----------------------- */
export function SalesLeadsByOutcome({ outcome }) {
  const won = outcome === 'won';
  const status = won ? CONVERTED : NOT_CONVERTED;
  const { items, setItems, error, load } = useRecords('leads', `&status=${encodeURIComponent(status)}`);
  const [open, setOpen] = useState(null);
  const { notify } = useApp();
  const title = won ? 'Customer Converted' : 'Customers Not Converted';

  async function remove(lead) {
    if (!confirm(`Delete enquiry ${lead.enqNo}?`)) return;
    try {
      await api(`/records/leads/${lead.id}`, { method: 'DELETE' });
      setOpen(null);
      setItems((l) => l.filter((x) => x.id !== lead.id));
      notify('Enquiry deleted');
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  return (
    <SalesShell subtitle={title}>
      <Panel title={title}>
        <State items={items} error={error} onRetry={load} loadingText="Loading customers…" emptyText={won ? 'No converted customers yet.' : 'No lost enquiries.'}>
          <div className="sp-table-wrap">
            <table className="sp-table">
              <thead><tr><th>Enquiry No</th><th>Company</th><th>Contact</th><th>Phone</th><th>Location</th><th>Handled By</th><th>{won ? 'Converted On' : 'Closed On'}</th><th>Action</th></tr></thead>
              <tbody>
                {(items || []).map((l) => (
                  <tr key={l.id}>
                    <td className="b">{l.enqNo}</td>
                    <td><span className="co"><Building2 size={18} />{l.companyName}</span></td>
                    <td>{l.customerName}</td>
                    <td>{l.phone}</td>
                    <td>{[l.city, l.state].filter(Boolean).join(', ') || '—'}</td>
                    <td>{l.assignedToName || l.createdByName || '—'}</td>
                    <td>{usDate(l.statusChangedAt)}</td>
                    <td><button className="sp-view" onClick={() => setOpen(l)}><Eye size={18} /> View Details</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </State>
      </Panel>
      {open && (
        <LeadDetailModal lead={open} onClose={() => setOpen(null)} onDelete={remove}
          onChanged={(u) => { setOpen(null); setItems((l) => (u.status === status ? l.map((x) => (x.id === u.id ? u : x)) : l.filter((x) => x.id !== u.id))); }} />
      )}
    </SalesShell>
  );
}

/* --------------------------- Overall Customer -> Customer Details --------------------------- */
export function SalesCustomers() {
  const { items, setItems, error, load } = useRecords('customers');
  const { user, modules, notify } = useApp();
  const level = levelOf(user, 'customers');
  const [q, setQ] = useState('');
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items || []).filter((c) => !s || [c.companyName, c.pan, c.gst].some((x) => String(x || '').toLowerCase().includes(s)));
  }, [items, q]);

  async function remove(c) {
    if (!confirm(`Delete ${c.companyName}?`)) return;
    try {
      await api(`/records/customers/${c.id}`, { method: 'DELETE' });
      setViewing(null);
      setItems((l) => l.filter((x) => x.id !== c.id));
      notify('Customer deleted');
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  return (
    <SalesShell subtitle="Customer Details">
      <Panel title="Customer Details" actions={canCreate(level) && <button className="sp-btn b-blue" onClick={() => setEditing({})}><Plus size={18} /> Add Customer</button>}>
        <div className="sp-search"><Search size={22} /><input placeholder="Search by Company Name, PAN, or GSTN..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <State items={items} error={error} onRetry={load} loadingText="Loading customers…" emptyText="No customers yet.">
          <div className="sp-table-wrap">
            <table className="sp-table">
              <thead><tr><th>PAN Number</th><th>GSTN Number</th><th>Company Name</th><th>Action</th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={4} className="sp-none">No customers match “{q}”.</td></tr>}
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td>{c.pan || '—'}</td>
                    <td>{c.gst || '—'}</td>
                    <td><span className="co"><Building2 size={18} />{c.companyName}</span></td>
                    <td><button className="sp-view" onClick={() => setViewing(c)}><Eye size={18} /> View Details</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </State>
      </Panel>
      {viewing && (
        <RecordViewModal mod={modules.customers} record={viewing} showOwner onClose={() => setViewing(null)}
          onEdit={canEditRecord(level, viewing, user) ? () => { setEditing(viewing); setViewing(null); } : null}
          onDelete={canDelete(level) ? () => remove(viewing) : null} />
      )}
      {editing && <RecordFormModal moduleKey="customers" mod={modules.customers} record={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </SalesShell>
  );
}

/* ------------------------------ Inventory Management ------------------------------ */
export function SalesInventory() {
  const navigate = useNavigate();
  const { user, modules } = useApp();
  const level = levelOf(user, 'inventory');
  const mayEdit = canEditRecord(level, {}, user); // Inventory Manager / admin: add and update stock
  const { items, error, load } = useRecords('inventory');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items || []).filter((p) => !s || [p.itemCode, p.model, p.brand].some((x) => String(x || '').toLowerCase().includes(s)));
  }, [items, q]);
  return (
    <SalesShell subtitle="Inventory Management">
      <Panel
        title="Inventory Management" icon={Package}
        actions={
          <>
            {levelOf(user, 'poRequests') && <button className="sp-btn b-blue" onClick={() => navigate('/SaleteamDasboard/purchaseOrder')}><FileText size={18} /> Purchase Order</button>}
            {levelOf(user, 'pi') && <button className="sp-btn b-purple" onClick={() => navigate('/SaleteamDasboard/invoices')}><FileText size={18} /> Performa Invoice</button>}
            {canCreate(level) && <button className="sp-btn b-green" onClick={() => setEditing({ inward: 0, outward: 0 })}><Plus size={18} /> Add Product</button>}
          </>
        }
      >
        <div className="sp-search"><Search size={22} /><input placeholder="Search by Item Code, Model or Brand..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {items === null ? <div className="sp-loading"><div className="spinner" />Loading products…</div> : error ? <div className="sp-error">{error} <button className="lc-link" onClick={load}>Try again</button></div> : (
          <>
            <div className="sp-table-wrap flush">
              <table className="sp-table inv">
                <thead><tr><th>Item Code</th><th>Model</th><th>Brand</th><th>Price</th><th>Inward</th><th>Outward</th><th>Current</th></tr></thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={7} className="sp-none big"><Package size={64} strokeWidth={1.2} /><div>No products found</div></td></tr>
                  )}
                  {rows.map((p) => {
                    const low = Number(p.current) <= Number(p.minStock || 0);
                    return (
                      <tr key={p.id} className={`${low ? 'low' : ''}${mayEdit ? ' clickable' : ''}`} onClick={mayEdit ? () => setEditing(p) : undefined} title={mayEdit ? 'Click to update stock' : undefined}>
                        <td className="b">{p.itemCode}</td>
                        <td>{p.model || '—'}</td>
                        <td>{p.brand || '—'}</td>
                        <td>{rupees(p.price, 2)}</td>
                        <td>{p.inward ?? 0}</td>
                        <td>{p.outward ?? 0}</td>
                        <td><span className={`cur${low ? ' low' : ''}`}>{p.current ?? 0}{low ? ' · low' : ''}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="sp-foot">Showing <b>{rows.length}</b> of <b>{items.length}</b> products{mayEdit && ' · click a row to update inward / outward stock'}</div>
          </>
        )}
      </Panel>
      {editing && <RecordFormModal moduleKey="inventory" mod={modules.inventory} record={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </SalesShell>
  );
}

/* ----------------------------------- Invoices ----------------------------------- */
export function SalesInvoices() {
  const navigate = useNavigate();
  const { user, notify } = useApp();
  const level = levelOf(user, 'pi');
  const { items, setItems, error, load } = useRecords('pi');
  const [openId, setOpenId] = useState(null);
  const open = items?.find((x) => x.id === openId);

  async function remove(pi) {
    if (!confirm(`Delete ${pi.piNumber}? This cannot be undone.`)) return;
    try {
      await api(`/records/pi/${pi.id}`, { method: 'DELETE' });
      setOpenId(null);
      setItems((l) => l.filter((x) => x.id !== pi.id));
      notify('Invoice deleted');
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  return (
    <SalesShell subtitle="Invoices" back={false}>
      <section className="inv-panel">
        <header>
          <div>
            <h2>Invoices</h2>
            <p>Manage and generate Proforma Invoices</p>
          </div>
          <div className="sp-actions">
            {canCreate(level) && <button className="sp-btn b-purple" onClick={() => navigate(CREATE_PAGES.pi)}><Plus size={18} /> Create Invoice</button>}
            <Link to={SALES_HOME} className="back-dash small">← Back to Dashboard</Link>
          </div>
        </header>
      </section>
      {open ? (
        <div style={{ marginTop: 24 }}>
          <InvoiceDetail pi={open} onBack={() => setOpenId(null)}
            onDelete={canDelete(level) ? () => remove(open) : null}
            onEdit={canEditRecord(level, open, user) ? () => navigate(`${CREATE_PAGES.pi}?id=${open.id}`) : null} />
        </div>
      ) : (
        <section className="inv-panel table">
          <State items={items} error={error} onRetry={load} loadingText="Loading invoices…" emptyText="No proforma invoices yet.">
            <div className="sp-table-wrap flush">
              <table className="sp-table pi">
                <thead><tr><th>PI No</th><th>Customer</th><th>Date</th><th>Amount</th><th>PO No</th><th>Reference</th><th>Status</th><th className="r">Actions</th></tr></thead>
                <tbody>
                  {(items || []).map((pi) => (
                    <tr key={pi.id}>
                      <td className="b">{pi.piNumber}</td>
                      <td>{pi.customerName}</td>
                      <td>{usDate(pi.piDate || pi.createdAt)}</td>
                      <td>{money2(pi.totalPayable)}</td>
                      <td>{pi.poNo || '—'}</td>
                      <td>{[pi.yourRef, pi.refDate].filter(Boolean).join(' | ') || '—'}</td>
                      <td><span className="pi-status">{pi.status}</span></td>
                      <td className="r nowrap">
                        <button className="pi-btn view" onClick={() => setOpenId(pi.id)}>View</button>
                        <a className="pi-btn pdf" href={`/print/pi/${pi.id}`} target="_blank" rel="noreferrer">PDF</a>
                        {canDelete(level) && <button className="pi-btn del" onClick={() => remove(pi)}>Delete</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </State>
        </section>
      )}
    </SalesShell>
  );
}

/* -------------------------------- Latest Quotations -------------------------------- */
export function SalesQuotations() {
  const { user, modules, notify } = useApp();
  const level = levelOf(user, 'quotations');
  const { items, setItems, error, load } = useRecords('quotations');
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null);
  const open = items?.find((x) => x.id === openId);

  async function remove(q) {
    if (!confirm(`Delete quotation ${q.referenceNo}?`)) return;
    try {
      await api(`/records/quotations/${q.id}`, { method: 'DELETE' });
      setOpenId(null);
      setItems((l) => l.filter((x) => x.id !== q.id));
      notify('Quotation deleted');
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  return (
    <SalesShell subtitle="Quotations">
      {open ? (
        <QuotationDetail q={open} onBack={() => setOpenId(null)}
          onDelete={canDelete(level) ? () => remove(open) : null}
          onEdit={canEditRecord(level, open, user) ? () => setEditing(open) : null} />
      ) : (
        <Panel title="Latest Quotations" icon={FileText} actions={canCreate(level) && <button className="sp-btn b-purple" onClick={() => setEditing({ gst: 18 })}><Plus size={18} /> New Quotation</button>}>
          <State items={items} error={error} onRetry={load} loadingText="Loading quotations…" emptyText="No quotations yet.">
            <div className="sp-table-wrap">
              <table className="sp-table">
                <thead><tr><th>Quotation</th><th>Reference No</th><th>Customer</th><th>Total Payable</th><th>Payment Due</th><th>Status</th><th>Date</th><th>Action</th></tr></thead>
                <tbody>
                  {(items || []).map((q) => (
                    <tr key={q.id}>
                      <td className="b">{q.enquiryNo}</td>
                      <td>{q.referenceNo}</td>
                      <td>{q.customerName}</td>
                      <td className="green b">{rupees(q.totalPayable, 2)}</td>
                      <td>{q.paymentDue || '—'}</td>
                      <td><StatusBadge status={q.status} /></td>
                      <td>{usDate(q.createdAt)}</td>
                      <td className="nowrap">
                        <button className="sp-view" onClick={() => setOpenId(q.id)}><Eye size={18} /> View</button>
                        {canDelete(level) && <button className="pi-btn del" style={{ marginLeft: 8 }} onClick={() => remove(q)}>Delete</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </State>
        </Panel>
      )}
      {editing && <RecordFormModal moduleKey="quotations" mod={modules.quotations} record={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </SalesShell>
  );
}

/* ---------------------- Printable proforma invoice (the "PDF" button) ---------------------- */
export function PrintInvoice() {
  const { id } = useParams();
  const [pi, setPi] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api(`/records/pi/${id}`).then(setPi).catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    if (!pi) return;
    document.title = pi.piNumber.replace(/\//g, '-');
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [pi]);
  if (error) return <div className="center-msg">{error}</div>;
  if (!pi) return <Loading text="Preparing invoice…" />;
  return (
    <div className="pf-print">
      <div className="print-tools no-print"><button className="btn btn-primary" onClick={() => window.print()}>Print / Save as PDF</button></div>
      <PiSheet pi={pi} />
    </div>
  );
}
