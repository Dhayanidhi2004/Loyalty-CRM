import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Clock, FileText, Plus, Trash2 } from 'lucide-react';
import Shell from '../components/Shell';
import { BackPill, Loading } from '../components/Bits';
import { RecordFormModal, RecordViewModal } from '../components/RecordModals';
import { api } from '../api';
import { useApp } from '../AppContext';
import { canCreate, canDelete, canEditRecord, levelOf } from '../access';
import { CREATE_PAGES } from './create/CreateDocuments';

/* ---------- helpers ---------- */
export const rupees = (v, dp = 0) => (v === null || v === undefined || v === '' ? '₹' : `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: 2 })}`);
const plain = (v, dp) => (v === null || v === undefined || v === '' ? '' : dp ? Number(v).toFixed(dp) : String(v));
const dash = (v) => (v === null || v === undefined || v === '' ? '—' : v);
const ymdToDmy = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10).split('-').reverse().join('/') : dash(v));

// Loads a module's records and provides add / view / edit / delete wired to the caller's role.
function useModuleList(moduleKey, createdBy) {
  const { modules, user, notify } = useApp();
  const mod = modules[moduleKey];
  const level = levelOf(user, moduleKey);
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState(null);
  const [viewing, setViewing] = useState(null);
  const navigate = useNavigate();
  const createPage = CREATE_PAGES[moduleKey]; // PI / PO: full-page form instead of a pop-up
  // "Add …" quick actions link here with ?new=1 to open the form straight away
  const [editing, setEditingState] = useState(() => (!createPage && params.get('new') === '1' && canCreate(level) ? {} : null));
  const setEditing = useCallback((rec) => {
    if (createPage && rec) navigate(rec.id ? `${createPage}?id=${rec.id}` : createPage);
    else setEditingState(rec);
  }, [createPage, navigate]);
  useEffect(() => {
    if (params.get('new') === '1') {
      if (createPage && canCreate(level)) return navigate(createPage, { replace: true });
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams, createPage, level, navigate]);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (createdBy) qs.set('createdBy', createdBy);
    try {
      setItems((await api(`/records/${moduleKey}?${qs}`)).items);
    } catch (e) {
      notify(e.message, 'error');
      setItems([]);
    }
  }, [moduleKey, createdBy, notify]);
  useEffect(() => { load(); }, [load]);

  async function remove(rec, label) {
    if (!confirm(`Delete ${label || `this ${mod.singular.toLowerCase()}`}? This cannot be undone.`)) return false;
    try {
      await api(`/records/${moduleKey}/${rec.id}`, { method: 'DELETE' });
      notify(`${mod.singular} deleted`);
      setViewing(null);
      setItems((list) => list.filter((x) => x.id !== rec.id));
      return true;
    } catch (e) {
      notify(e.message, 'error');
      return false;
    }
  }

  const isAdmin = level === 'admin';
  const modals = (
    <>
      {viewing && (
        <RecordViewModal
          mod={mod} record={viewing} showOwner onClose={() => setViewing(null)}
          onEdit={canEditRecord(level, viewing, user) ? () => { setEditing(viewing); setViewing(null); } : null}
          onDelete={canDelete(level) ? () => remove(viewing) : null}
        />
      )}
      {editing && (
        <RecordFormModal moduleKey={moduleKey} mod={mod} record={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </>
  );
  // Admin screens match the original exactly; other roles also get a "New" button.
  const newButton = !isAdmin && canCreate(level) && (
    <button className="btn-new" style={{ marginTop: 0 }} onClick={() => setEditing({})}><Plus size={18} /> New {mod.singular}</button>
  );
  return { mod, level, user, items, load, remove, viewing, setViewing, editing, setEditing, modals, newButton, isAdmin, canDel: canDelete(level) };
}

function PageTitleLeft({ back, title, extra }) {
  return (
    <div className="cp-head">
      <BackPill to={back} />
      <h1 className="cp-title">{title}</h1>
      <span style={{ flex: 1 }} />
      {extra}
    </div>
  );
}

const Empty = ({ text }) => <div className="cp-empty">{text}</div>;

/* =====================================================================
   Proforma invoices — "Invoice Management"
   ===================================================================== */
export function InvoiceDetail({ pi, onBack, onDelete, onEdit }) {
  const items = pi.items || [];
  const flag = (v) => (v === 'Yes' ? 'yes' : v === 'No' ? 'no' : '');
  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button className="back-list" onClick={onBack}>Back to List</button>
        {onEdit && <button className="back-list" onClick={onEdit}>Edit</button>}
        {onDelete && <button className="back-list danger" onClick={onDelete}>Delete</button>}
      </div>
      <article className="inv-card">
        <header className="inv-head">
          <div>
            <h2>{pi.piNumber}</h2>
            <p>PI ID: <b>{pi.piId}</b></p>
          </div>
          <div className="inv-head-right">
            {pi.status && <span className="pill-grey">{pi.status}</span>}
            <span>FY: {pi.fy || '—'}</span>
          </div>
        </header>
        <div className="inv-body">
          <div className="inv-3">
            <section>
              <h4>Customer Details</h4>
              <dl className="inv-dl">
                <dt>Name:</dt><dd className="b">{dash(pi.customerName)}</dd>
                <dt>Address:</dt><dd>{dash(pi.address)}</dd>
                {pi.phone && (<><dt>Phone:</dt><dd>{pi.phone}</dd></>)}
                {pi.gstin && (<><dt>GSTIN:</dt><dd>{pi.gstin}</dd></>)}
                {pi.state && (<><dt>State:</dt><dd>{pi.state}</dd></>)}
              </dl>
            </section>
            <section>
              <h4 className="green-line">Reference Details</h4>
              <dl className="inv-dl">
                {pi.piDate && (<><dt>PI Date:</dt><dd>{ymdToDmy(pi.piDate)}</dd></>)}
                <dt>Your Ref:</dt><dd className="b">{dash(pi.yourRef)}</dd>
                <dt>Ref Date:</dt><dd>{ymdToDmy(pi.refDate)}</dd>
                <dt>PO No:</dt><dd className="b">{dash(pi.poNo)}</dd>
                <dt>PO Date:</dt><dd>{ymdToDmy(pi.poDate)}</dd>
                {pi.paymentTerms && (<><dt>Payment Terms:</dt><dd>{pi.paymentTerms}</dd></>)}
                {pi.delivery && (<><dt>Delivery:</dt><dd>{pi.delivery}</dd></>)}
                <dt>Jurisdiction:</dt><dd>{dash(pi.jurisdiction)}</dd>
              </dl>
            </section>
            <section>
              <h4>Financial Summary</h4>
              <dl className="inv-dl">
                <dt>Discount:</dt><dd className="red">{plain(pi.discount)}%</dd>
                <dt>LP Amount:</dt><dd className="blue">{rupees(pi.lpAmount)}</dd>
                <dt>Freight:</dt><dd className="blue">{rupees(pi.freight)}</dd>
                <dt>GST:</dt><dd>{plain(pi.gst)}%</dd>
              </dl>
            </section>
          </div>

          <div className="inv-flags">
            <div><i className={`dot ${flag(pi.certification) || 'grey'}`} />Certification: <b className={flag(pi.certification)}>{dash(pi.certification)}</b></div>
            <div><i className={`dot ${flag(pi.goodsReturn) || 'grey'}`} />Goods Return: <b className={flag(pi.goodsReturn)}>{dash(pi.goodsReturn)}</b></div>
            <div><i className="dot blue" />Interest Rate: <b className="blue">{plain(pi.interestRate) ? `${plain(pi.interestRate)}%` : '—'}</b></div>
          </div>

          <h3 className="inv-items-title"><FileText size={22} /> Product Items ({items.length})</h3>
          <div className="inv-table">
            <table>
              <thead><tr><th>Item Name</th><th>Unit Description</th><th>UOM</th><th className="r">Quantity</th><th className="r">Unit Price</th><th className="r">Total</th></tr></thead>
              <tbody>
                {items.length === 0 && <tr><td colSpan={6} className="none">No items</td></tr>}
                {items.map((it, i) => (
                  <tr key={i}>
                    <td>{dash(it.itemName)}</td>
                    <td>{dash(it.unitDescription)}</td>
                    <td>{dash(it.uom)}</td>
                    <td className="r b">{dash(it.quantity)}</td>
                    <td className="r mono">₹{plain(it.unitPrice)}</td>
                    <td className="r green b">₹{plain(it.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="cost-box">
            <div>
              <h3>Cost Breakdown</h3>
              <dl className="cost-dl">
                <dt>Subtotal:</dt><dd>{rupees(pi.subtotal)}</dd>
                <dt>Freight:</dt><dd>{rupees(pi.freight || 0)}</dd>
                <dt>GST:</dt><dd>{rupees(pi.gstAmount)}</dd>
                <dt>Round Off:</dt><dd>{rupees(pi.roundOff || 0)}</dd>
              </dl>
            </div>
            <div className="pay-card">
              <span>Total Payable</span>
              <strong>{rupees(pi.totalPayable)}</strong>
            </div>
          </div>
        </div>
      </article>
    </>
  );
}

export function InvoicePage({ back, createdBy }) {
  const L = useModuleList('pi', createdBy);
  const [openId, setOpenId] = useState(null);
  const open = L.items?.find((x) => x.id === openId);
  return (
    <Shell>
      <div className="page bg-grey">
        <div className="page-inner">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <BackPill to={back} variant="big" />
            {L.newButton}
          </div>
          <div className="inv-title">
            <h1>Invoice Management</h1>
            <p>Comprehensive view of all proforma invoices</p>
            <span className="bar" />
          </div>
          {L.items === null ? <Loading /> : open ? (
            <InvoiceDetail
              pi={open} onBack={() => setOpenId(null)}
              onDelete={L.canDel ? async () => { if (await L.remove(open, open.piNumber)) setOpenId(null); } : null}
              onEdit={canEditRecord(L.level, open, L.user) ? () => L.setEditing(open) : null}
            />
          ) : L.items.length === 0 ? <Empty text="No proforma invoices yet." /> : (
            <div className="inv-list">
              {L.items.map((pi) => (
                <article key={pi.id} className="inv-mini" onClick={() => setOpenId(pi.id)}>
                  <header className="inv-head small">
                    <div>
                      <h2>{pi.piNumber}</h2>
                      <p>PI ID: <b>{pi.piId}</b></p>
                    </div>
                    <div className="inv-head-right">
                      {pi.status && <span className="pill-grey">{pi.status}</span>}
                      <span>FY: {pi.fy || '—'}</span>
                    </div>
                  </header>
                  <div className="inv-mini-body">
                    <div><span>Customer</span><b>{dash(pi.customerName)}</b></div>
                    <div><span>Ref Date</span><b>{ymdToDmy(pi.refDate)}</b></div>
                    <div><span>Total Payable</span><b className="green">{rupees(pi.totalPayable)}</b></div>
                  </div>
                  <footer><button className="view-more">View Details</button></footer>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
      {L.modals}
    </Shell>
  );
}

/* =====================================================================
   Quotations — "Quotation Management" cards -> View More
   ===================================================================== */
export function QuotationDetail({ q, onBack, onDelete, onEdit }) {
  const products = q.products || [];
  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 40 }}>
        <button className="back-list" onClick={onBack}><ChevronLeft size={18} style={{ verticalAlign: -3 }} /> Back to List</button>
        {onEdit && <button className="back-list" onClick={onEdit}>Edit</button>}
        {onDelete && <button className="back-list danger" onClick={onDelete}>Delete</button>}
      </div>
      <article className="inv-card">
        <header className="inv-head">
          <div>
            <h2 className="with-bar">{q.referenceNo}</h2>
            <p>Quotation ID: <b>{q.enquiryNo}</b></p>
          </div>
          {q.status && <span className="pill-grey big">{q.status}</span>}
        </header>
        <div className="inv-body soft">
          <div className="q-cards">
            <section className="q-card">
              <h4 className="indigo"><FileText size={22} /> Quotation Details</h4>
              <dl className="q-dl">
                <dt>Enquiry No:</dt><dd className="b">{q.enquiryNo}</dd>
                <dt>Reference No:</dt><dd className="b">{q.referenceNo}</dd>
                <dt>Customer:</dt><dd>{dash(q.customerName)}</dd>
                <dt>Total Payable:</dt><dd className="green b big">{rupees(q.totalPayable, 2)}</dd>
                <dt>Discount:</dt><dd className="red">{/^\d+(\.\d+)?$/.test(String(q.discount ?? '')) ? `${q.discount}%` : '%'}</dd>
                <dt>LP Amount:</dt><dd className="blue">{rupees(q.lpAmount)}</dd>
                <dt>Freight Charges</dt><dd className="blue b">{q.freight ? rupees(q.freight) : 'N/A'}</dd>
              </dl>
            </section>
            <section className="q-card">
              <h4 className="greenish"><Clock size={20} /> Terms &amp; Validity</h4>
              <dl className="q-dl">
                <dt>Payment Due:</dt><dd>{dash(q.paymentDue)}</dd>
                <dt>Validity:</dt><dd>{dash(q.validity)}</dd>
                <dt>Warranty:</dt><dd>{dash(q.warranty)}</dd>
                <dt>Delivery:</dt><dd>{dash(q.delivery)}</dd>
                <dt>GST:</dt><dd>{plain(q.gst) ? `${plain(q.gst)}%` : '—'}</dd>
              </dl>
            </section>
          </div>
          <section className="q-card wide">
            <h4 className="indigo plain"><FileText size={22} /> Product Items ({products.length})</h4>
            <div className="inv-table">
              <table>
                <thead><tr><th>Description</th><th>HSN Code</th><th>Unit Description</th><th>UOM</th><th className="r">Quantity</th><th className="r">Unit Price</th><th className="r">Total</th></tr></thead>
                <tbody>
                  {products.length === 0 && <tr><td colSpan={7} className="none">No items</td></tr>}
                  {products.map((p, i) => (
                    <tr key={i}>
                      <td>{dash(p.description)}</td><td>{dash(p.hsnCode)}</td><td>{dash(p.unitDescription)}</td><td>{dash(p.uom)}</td>
                      <td className="r b">{dash(p.quantity)}</td>
                      <td className="r mono">₹{plain(p.unitPrice)}</td>
                      <td className="r green b">₹{plain(p.total, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </article>
    </>
  );
}

export function QuotationPage({ back, createdBy }) {
  const L = useModuleList('quotations', createdBy);
  const [openId, setOpenId] = useState(null);
  const open = L.items?.find((x) => x.id === openId);
  const Box = ({ label, value }) => (<div><div className="doc-lbl">{label}</div><div className="q-box">{dash(value)}</div></div>);
  return (
    <Shell>
      <div className="page bg-soft">
        <div className="page-inner">
          <div className="head-row center-title">
            <div><BackPill to={back} /></div>
            <h1 className="title-mgmt">Quotation Management</h1>
            <div className="head-actions">{L.newButton}</div>
          </div>
          {L.items === null ? <Loading /> : open ? (
            <QuotationDetail
              q={open} onBack={() => setOpenId(null)}
              onDelete={L.canDel ? async () => { if (await L.remove(open, open.referenceNo)) setOpenId(null); } : null}
              onEdit={canEditRecord(L.level, open, L.user) ? () => L.setEditing(open) : null}
            />
          ) : L.items.length === 0 ? (
            <div className="mgmt-empty" style={{ marginTop: 50 }}>
              <h5>No Quotation Data</h5>
              <p>There are currently no quotations available. Please try again later or create a new quotation.</p>
              <button className="btn-refresh" onClick={L.load}>Refresh</button>
            </div>
          ) : (
            <div className="doc-grid">
              {L.items.map((q) => (
                <article key={q.id} className="doc-card">
                  <header className="doc-head q">
                    <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                      <h4 style={{ lineHeight: 1.3, whiteSpace: 'nowrap' }}>Quotation {q.enquiryNo}</h4>
                      <div className="q-ref">Reference No: <b>{q.referenceNo}</b></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
                      {q.status && <span className="pill-lav">{q.status}</span>}
                      {L.canDel && <button className="doc-del" onClick={() => L.remove(q, q.referenceNo)} aria-label="Delete"><Trash2 size={22} strokeWidth={2.4} /></button>}
                    </div>
                  </header>
                  <div className="doc-body">
                    <div className="q-grid">
                      <Box label="Total Payable Amount" value={plain(q.totalPayable, 2)} />
                      <Box label="Payment Due" value={q.paymentDue} />
                      <Box label="Validity" value={q.validity} />
                      <Box label="Warranty" value={q.warranty} />
                      <Box label="Delivery" value={q.delivery} />
                      <Box label="Discount" value={q.discount} />
                      <Box label="GST" value={plain(q.gst) ? `${plain(q.gst)}%` : null} />
                    </div>
                    <button className="view-more" style={{ marginTop: 40 }} onClick={() => setOpenId(q.id)}>View More</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
      {L.modals}
    </Shell>
  );
}

/* =====================================================================
   Product Requests
   ===================================================================== */
export function ProductRequestsPage({ back, createdBy }) {
  const L = useModuleList('productRequests', createdBy);
  return (
    <Shell>
      <div className="page bg-grey">
        <div className="page-inner">
          <PageTitleLeft back={back} title="Product Requests" extra={L.newButton} />
          {L.items === null ? <Loading /> : L.items.length === 0 ? <Empty text="No product requests yet." /> : (
            <div className="cp-grid">
              {L.items.map((r) => (
                <article key={r.id} className="pr-card" onClick={() => L.setViewing(r)}>
                  <div className="pr-top">
                    <h3>{r.createdByName || 'Employee'}</h3>
                    {r.status && <span className="pill-blue">{r.status}</span>}
                  </div>
                  <dl className="pr-dl">
                    <dt>Email:</dt><dd>{dash(r.email || r.createdByEmail)}</dd>
                    <dt>Company:</dt><dd>{dash(r.company)}</dd>
                    <dt>Contact Person:</dt><dd>{dash(r.contactPerson)}</dd>
                    <dt>Employee ID:</dt><dd>{dash(r.createdByCode)}</dd>
                  </dl>
                  <h4>Description</h4>
                  <div className="pr-box">{dash(r.description)}</div>
                  <h4>Products Requested</h4>
                  {(r.products || []).length === 0 && <div className="pr-box">—</div>}
                  {(r.products || []).map((p, i) => (
                    <div className="pr-box pr-item" key={i}><span>{p.name}</span><span className="units">{p.quantity ?? 0} units</span></div>
                  ))}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
      {L.modals}
    </Shell>
  );
}

/* =====================================================================
   All Sales Orders
   ===================================================================== */
export function SalesOrdersPage({ back, createdBy }) {
  const L = useModuleList('salesOrders', createdBy);
  return (
    <Shell>
      <div className="page bg-so">
        <div className="so-wrap">
          <div className="so-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <BackPill to={back} />
              {L.newButton}
            </div>
            <h1 className="so-title">All Sales Orders</h1>
            {L.items === null ? <Loading /> : L.items.length === 0 ? <Empty text="No sales orders yet." /> : (
              <div className="so-grid">
                {L.items.map((o) => (
                  <article key={o.id} className="so-card" onClick={() => L.setViewing(o)}>
                    <p><b>Sales Order ID:</b> {o.orderId}</p>
                    <p><b>Customer:</b> {dash(o.customer)}</p>
                    <p><b>Status:</b> {dash(o.status)}</p>
                    <p><b>Grand Total:</b> {rupees(o.grandTotal || 0)}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {L.modals}
    </Shell>
  );
}

/* =====================================================================
   Work visits — "Service Engineers"
   ===================================================================== */
export function ServiceEngineersPage({ back, createdBy }) {
  const L = useModuleList('workVisits', createdBy);
  return (
    <Shell>
      <div className="page bg-grey">
        <div className="page-inner full">
          <PageTitleLeft back={back} title="Service Engineers" extra={L.newButton} />
          {L.items === null ? <Loading /> : L.items.length === 0 ? <Empty text="No work visits yet." /> : (
            <div className="cp-grid">
              {L.items.map((v) => (
                <article key={v.id} className="se-card" onClick={() => L.setViewing(v)}>
                  <header>
                    <h3>{v.createdByName || 'Engineer'}</h3>
                    <span>{dash(v.company)}</span>
                  </header>
                  <div className="se-body">
                    <label>Machine</label><p>{dash(v.machine)}</p>
                    <label>Product Description</label><p>{dash(v.productDescription)}</p>
                    <label>Complaints</label><p>{dash(v.complaints)}</p>
                    <label>Assessment</label><p>{v.assessment || 'No assessment provided'}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
      {L.modals}
    </Shell>
  );
}

/* =====================================================================
   Service Details
   ===================================================================== */
export function ServiceDetailsPage({ back, createdBy }) {
  const L = useModuleList('serviceDetails', createdBy);
  const rows = [
    ['Customer Inward', 'customerInward'], ['Quantity', 'quantity'], ['Material', 'material'], ['Model', 'model'], ['Serial No', 'serialNo'],
    ['Power Consumption', 'powerConsumption'], ['Service Start', 'serviceStart'], ['Service End', 'serviceEnd'],
    ['Service Status', 'serviceStatus'], ['Billing Status', 'billingStatus'],
  ];
  return (
    <Shell>
      <div className="page bg-grey">
        <div className="page-inner full">
          <PageTitleLeft back={back} title="Service Details" extra={L.newButton} />
          {L.items === null ? <Loading /> : L.items.length === 0 ? <Empty text="No service records yet." /> : (
            <div className="cp-grid">
              {L.items.map((s) => (
                <article key={s.id} className="se-card" onClick={() => L.setViewing(s)}>
                  <header>
                    <h3>Client: {dash(s.client)}</h3>
                    <span>EID: {dash(s.eid)}</span>
                  </header>
                  <div className="se-body lines">
                    <p><b>Employee ID:</b> {dash(s.createdByCode)}</p>
                    {rows.map(([label, key]) => <p key={key}><b>{label}:</b> {dash(s[key])}</p>)}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
      {L.modals}
    </Shell>
  );
}
