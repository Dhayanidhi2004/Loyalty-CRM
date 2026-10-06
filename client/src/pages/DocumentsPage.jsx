import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, DollarSign, Eye, EyeOff, Package, Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import Shell from '../components/Shell';
import { BackPill, Loading } from '../components/Bits';
import { RecordFormModal } from '../components/RecordModals';
import { CREATE_PAGES } from './create/CreateDocuments';
import { canCreate, canDelete, canEditRecord, levelOf } from '../access';
import { api } from '../api';
import { useApp } from '../AppContext';

const PAGE_SIZE = 4; // the original shows four cards per page ("Page 1 of 6")

const show = (v) => (v === null || v === undefined || v === '' ? '-' : String(v));

function Field({ label, value, icon: Icon }) {
  return (
    <div>
      <div className="doc-lbl">{Icon && <Icon size={16} />}{label}</div>
      <div className="doc-val">{show(value)}</div>
    </div>
  );
}

function DocCard({ doc, mod, open, onToggle, onDelete, onEdit }) {
  return (
    <article className={`doc-card${open ? ' open' : ''}`}>
      <header className="doc-head">
        <h4>{doc.companyName || '—'} - {doc.docNumber || '—'}</h4>
        {onDelete && (
          <button className="doc-del" onClick={() => onDelete(doc)} title="Delete" aria-label="Delete"><Trash2 size={22} strokeWidth={2.4} /></button>
        )}
      </header>
      <div className="doc-body">
        <div className="doc-pair">
          <div>
            <div className="doc-lbl">ID</div>
            <div className="doc-box">{show(doc.createdByCode)}</div>
          </div>
          <div>
            <div className="doc-lbl">Payable Amount</div>
            <div className="doc-box money">{show(doc.payableAmount)}</div>
          </div>
        </div>

        {open && (
          <>
            <div className="divider-t">{mod.singular} Details</div>
            <div className="doc-3">
              <Field label="paymentTerms" value={doc.paymentTerms} icon={DollarSign} />
              <Field label="warrantyTerms" value={doc.warrantyTerms} icon={CalendarDays} />
              <Field label="deliveryTerms" value={doc.deliveryTerms} icon={Package} />
              <Field label="gst" value={doc.gst} icon={Tag} />
              <Field label="gstAmount" value={doc.gstAmount} />
              <Field label="totalAmount" value={doc.totalAmount} />
            </div>

            <div className="prod-head">
              <Package size={24} /> Products <span className="prod-count">{doc.products?.length || 0}</span>
            </div>
            {(doc.products || []).map((p, i) => (
              <div className="prod-box" key={i}>
                <div className="doc-3">
                  <Field label="hsnCode" value={p.hsnCode} />
                  <Field label="unitDescription" value={p.unitDescription} />
                  <Field label="description" value={p.description} />
                  <Field label="uom" value={p.uom} />
                  <Field label="quantity" value={p.quantity} />
                  <Field label="unitPrice" value={p.unitPrice} />
                  <Field label="amount" value={p.amount} />
                </div>
              </div>
            ))}

            <div className="divider-t">Other Details</div>
            <div className="doc-3">
              <Field label="LP" value={doc.lp} />
              <Field label="Address" value={doc.address} />
              <Field label="discount" value={doc.discount} />
              <Field label="SuppNO" value={doc.suppNo} />
              <Field label="GSTIN" value={doc.gstin} />
              <Field label="QDate" value={doc.qDate} />
              <Field label="RefQNo" value={doc.refQNo} />
              <Field label="Financial Year" value={doc.financialYear} />
            </div>
          </>
        )}
      </div>
      <footer className="doc-foot">
        {open ? (
          <button className="doc-btn hide" onClick={onToggle}><EyeOff size={18} /> Hide Details</button>
        ) : (
          <button className="doc-btn" onClick={onToggle}><Eye size={18} /> View Details</button>
        )}
        {onEdit && <button className="doc-btn" onClick={() => onEdit(doc)}><Pencil size={16} /> Edit</button>}
      </footer>
    </article>
  );
}

// "Purchase Order Management", "Quotation Management", PI and Sales Orders.
export default function DocumentsPage({ moduleKey, back, createdBy }) {
  const { modules, user, notify } = useApp();
  const mod = modules[moduleKey];
  const level = levelOf(user, moduleKey);
  const isAdmin = level === 'admin';
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const createPage = CREATE_PAGES[moduleKey]; // Purchase orders open the full "Create Purchase Order" page
  const [editing, setEditingState] = useState(() => (!createPage && params.get('new') === '1' && canCreate(level) ? {} : null));
  const setEditing = (rec) => {
    if (createPage && rec) navigate(rec.id ? `${createPage}?id=${rec.id}` : createPage);
    else setEditingState(rec);
  };
  useEffect(() => {
    if (createPage && params.get('new') === '1' && canCreate(level)) navigate(createPage, { replace: true });
  }, [createPage, params, level, navigate]);

  const load = useCallback(async (p = page) => {
    setData(null);
    const qs = new URLSearchParams({ page: p, limit: PAGE_SIZE });
    if (createdBy) qs.set('createdBy', createdBy);
    try {
      setData(await api(`/records/${moduleKey}?${qs}`));
    } catch (e) {
      setData({ items: [], total: 0, pages: 1, error: e.message });
    }
  }, [moduleKey, page, createdBy]);

  useEffect(() => { load(page); }, [load, page]);

  async function remove(doc) {
    if (!confirm(`Delete ${doc.docNumber || `this ${mod.singular.toLowerCase()}`}? This cannot be undone.`)) return;
    try {
      await api(`/records/${moduleKey}/${doc.id}`, { method: 'DELETE' });
      notify(`${mod.singular} deleted`);
      const lastOnPage = data.items.length === 1 && page > 1;
      if (lastOnPage) setPage(page - 1);
      else load(page);
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  const plural = `${mod.singular.toLowerCase()}s`;
  const pages = data?.pages || 1;

  return (
    <Shell>
      <div className="page bg-soft">
        <div className="page-inner">
          <div className="head-row center-title">
            <div><BackPill to={back} /></div>
            <h1 className="title-mgmt">{mod.title}</h1>
            <div className="head-actions">
              {!isAdmin && canCreate(level) && <button className="btn-new" onClick={() => setEditing({})}><Plus size={18} /> New {mod.singular}</button>}
              <div className="page-count">Page {Math.min(page, pages)} of {pages}</div>
            </div>
          </div>

          {data === null ? (
            <div style={{ marginTop: 60 }}><Loading /></div>
          ) : data.items.length === 0 ? (
            <>
              <div className="mgmt-alert" role="alert">
                <AlertTriangle size={24} /> {data.error || `No ${plural} available.`}
              </div>
              <div className="mgmt-empty">
                <div className="ic"><AlertTriangle size={36} /></div>
                <h5>No {mod.singular} Data</h5>
                <p>There are currently no {plural} available. Please try again later or create a new {mod.singular.toLowerCase()}.</p>
                <button className="btn-refresh" onClick={() => load(page)}>Refresh</button>
              </div>
            </>
          ) : (
            <>
              <div className="doc-grid">
                {data.items.map((doc) => (
                  <DocCard
                    key={doc.id} doc={doc} mod={mod} open={openId === doc.id}
                    onToggle={() => setOpenId(openId === doc.id ? null : doc.id)}
                    onDelete={canDelete(level) ? remove : null}
                    onEdit={!isAdmin && canEditRecord(level, doc, user) ? setEditing : null}
                  />
                ))}
              </div>
              {pages > 1 && (
                <div className="pager">
                  <button disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /> Previous</button>
                  <span>Page {page} of {pages}</span>
                  <button disabled={page >= pages} onClick={() => setPage(page + 1)}>Next <ChevronRight size={16} /></button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {editing && (
        <RecordFormModal
          moduleKey={moduleKey} mod={mod} record={editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); if (page !== 1 && !editing.id) setPage(1); else load(page); }}
        />
      )}
    </Shell>
  );
}
