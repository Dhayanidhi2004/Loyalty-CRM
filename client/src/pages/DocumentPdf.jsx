import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, FileDown, Pencil } from 'lucide-react';
import { PiFooter, PiLetterhead, PiSheet } from './create/CreateDocuments';
import { RecordFormModal } from '../components/RecordModals';
import { Loading } from '../components/Bits';
import { api } from '../api';
import { useApp } from '../AppContext';
import { amountInWords } from '../format';
import { canCreate, canEditRecord, levelOf } from '../access';
import { homeFor } from './Login';
import { Sheet as ProjectSheet } from './ProjectQuotations';

// One PDF view for every purchase order, proforma invoice and quotation.
export const PDF_KINDS = {
  po: { module: 'poRequests', label: 'Purchase Order', title: 'PURCHASE ORDER', numberKey: 'docNumber', edit: (id) => `/purchaseOrder/create?id=${id}` },
  pi: { module: 'pi', label: 'Proforma Invoice', title: 'PROFORMA INVOICE', numberKey: 'piNumber', edit: (id) => `/proformaInvoice/create?id=${id}` },
  quotation: { module: 'quotations', label: 'Quotation', title: 'QUOTATION', numberKey: 'referenceNo', edit: null }, // edited in a pop-up
  // Project Quotations page: same quotation layout, edited on that page
  project: { module: 'quotations', label: 'Quotation', title: 'QUOTATION', numberKey: 'ref', url: (id) => `/project-quotations/${id}`, edit: (id) => `/project-quotations?edit=${id}` },
};
export const pdfPath = (kind, id) => `/pdf/${kind}/${id}`;

// "PDF" link used on every list (opens the document in a new tab)
export function PdfLink({ kind, id, className = '', children = 'PDF', icon = false }) {
  return (
    <a className={className} href={pdfPath(kind, id)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
      {icon && <FileDown size={16} />}{children}
    </a>
  );
}

const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? 0 : Number(v));
const inr = (v, dp = 2) => `₹ ${num(v).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: 2 })}`;
const dmy = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('-') : '');

function PoSheet({ po }) {
  const items = po.products || [];
  return (
    <div className="pf-doc pf-sheet">
      <PiLetterhead title={PDF_KINDS.po.title} />
      <div className="pf-meta">
        <label><b>PO No:</b> <span>{po.docNumber}</span></label>
        <label><b>PO Date:</b> <span>{dmy(po.createdAt)}</span></label>
        <label><b>Ref Q No:</b> <span>{po.refQNo || ''}</span></label>
        <label><b>Q Date:</b> <span>{dmy(po.qDate)}</span></label>
      </div>
      <div className="pf-meta po">
        <label><b>Supplier No:</b> <span>{po.suppNo || ''}</span></label>
        <label><b>Financial Year:</b> <span>{po.financialYear || ''}</span></label>
      </div>
      <section className="pf-consignee">
        <div><div className="pf-cap">TO</div><div className="pf-name">{po.companyName}</div></div>
        <div className="pf-cons-right">
          <div className="pf-addr">{po.address}</div>
          <label><b>GSTIN:</b> <span>{po.gstin || ''}</span></label>
        </div>
      </section>
      <table className="pf-items">
        <thead><tr><th>S.No</th><th>HSN</th><th>Description</th><th>Unit Description</th><th>UOM</th><th className="r">Qty</th><th className="r">Unit Price</th><th className="r">Amount</th></tr></thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td className="sno">{i + 1}</td><td className="txt">{it.hsnCode || ''}</td><td className="txt">{it.description || ''}</td><td className="txt">{it.unitDescription || ''}</td><td className="txt">{it.uom || ''}</td>
              <td className="r txt">{it.quantity}</td><td className="r txt">{num(it.unitPrice).toLocaleString('en-IN')}</td><td className="r tot">{inr(it.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pf-bottom">
        <div className="pf-terms">
          <h4>Terms &amp; Conditions:</h4>
          <p>1. Payment Terms: {po.paymentTerms || '—'}</p>
          <p>2. Warranty Terms: {po.warrantyTerms || '—'}</p>
          <p>3. Delivery Terms: {po.deliveryTerms || '—'}</p>
        </div>
        <div className="pf-sum">
          <div><span>Total Amount:</span><span>{inr(po.totalAmount)}</span></div>
          <div><span>GST Amount ( {num(po.gst)} %):</span><span>{inr(po.gstAmount)}</span></div>
          {num(po.discount) > 0 && <div><span>Discount:</span><span>− {inr(po.discount)}</span></div>}
          <div className="grand"><span>PAYABLE:</span><span>{inr(po.payableAmount)}</span></div>
          <div className="words"><b>Amount In Words:</b><b>{amountInWords(po.payableAmount)}</b></div>
        </div>
      </div>
      <PiFooter />
    </div>
  );
}

function QuotationSheet({ q }) {
  const items = q.products || [];
  return (
    <div className="pf-doc pf-sheet">
      <PiLetterhead title={PDF_KINDS.quotation.title} />
      <div className="pf-meta two">
        <label><b>Reference No:</b> <span>{q.referenceNo}</span></label>
        <label><b>Date:</b> <span>{dmy(q.createdAt)}</span></label>
      </div>
      <section className="pf-consignee solo">
        <div><div className="pf-cap">TO</div><div className="pf-name">{q.customerName}</div></div>
      </section>
      <table className="pf-items">
        <thead><tr><th>S.No</th><th>Description</th><th>HSN</th><th>Unit Description</th><th>UOM</th><th className="r">Qty</th><th className="r">Unit Price</th><th className="r">Total</th></tr></thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td className="sno">{i + 1}</td><td className="txt">{it.description || ''}</td><td className="txt">{it.hsnCode || ''}</td><td className="txt">{it.unitDescription || ''}</td><td className="txt">{it.uom || ''}</td>
              <td className="r txt">{it.quantity}</td><td className="r txt">{num(it.unitPrice).toLocaleString('en-IN')}</td><td className="r tot">{inr(it.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pf-bottom">
        <div className="pf-terms">
          <h4>Terms &amp; Conditions:</h4>
          <p>1. Payment: {q.paymentDue || '—'}</p>
          <p>2. Validity: {q.validity || '—'}</p>
          <p>3. Warranty: {q.warranty || '—'}</p>
          <p>4. Delivery: {q.delivery || '—'}</p>
        </div>
        <div className="pf-sum">
          {/* any LP amount is part of the figure shown here, so the totals still add up without printing LP */}
          <div><span>Items Total:</span><span>{inr(num(q.itemsTotal) + num(q.lpAmount))}</span></div>
          {num(q.freight) > 0 && <div><span>Freight:</span><span>{inr(q.freight)}</span></div>}
          <div><span>GST Amount ( {num(q.gst)} %):</span><span>{inr(q.gstAmount)}</span></div>
          <div className="grand"><span>TOTAL:</span><span>{inr(q.totalPayable)}</span></div>
          <div className="words"><b>Amount In Words:</b><b>{amountInWords(q.totalPayable)}</b></div>
        </div>
      </div>
      <PiFooter />
    </div>
  );
}

export default function DocumentPdfPage() {
  const { kind, id } = useParams();
  const cfg = PDF_KINDS[kind];
  const navigate = useNavigate();
  const { user, modules } = useApp();
  const [rec, setRec] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    if (!cfg) return;
    api(cfg.url ? cfg.url(id) : `/records/${cfg.module}/${id}`).then(setRec).catch((e) => setError(e.message));
  }, [cfg, id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { // the saved PDF takes its file name from the page title
    if (rec) document.title = `${cfg.label}-${String(rec[cfg.numberKey] || id).replace(/[\\/]/g, '-')}`;
  }, [rec, cfg, id]);

  if (!cfg) return <div className="center-msg">Unknown document type.</div>;
  if (error) return <div className="center-msg">{error}</div>;
  if (!rec) return <Loading text="Preparing document…" />;

  const lvl = levelOf(user, cfg.module);
  const canEdit = kind === 'project' ? canCreate(lvl) : canEditRecord(lvl, rec, user);
  const edit = () => (cfg.edit ? navigate(cfg.edit(id)) : setEditing(true));
  const back = () => (window.opener ? window.close() : navigate(-1) || navigate(homeFor(user)));

  return (
    <div className="pf-print">
      <div className="print-tools no-print pdf-bar">
        <button className="btn btn-soft" onClick={back}><ChevronLeft size={16} /> Back</button>
        {canEdit && <button className="btn btn-green" onClick={edit}><Pencil size={16} /> Edit</button>}
        <button className="btn btn-primary" onClick={() => window.print()}><FileDown size={16} /> Download PDF</button>
        <span className="pdf-hint">In the print window choose “Save as PDF”.</span>
      </div>
      {kind === 'po' && <PoSheet po={rec} />}
      {kind === 'pi' && <PiSheet pi={rec} />}
      {kind === 'quotation' && <QuotationSheet q={rec} />}
      {kind === 'project' && <div className="pq-print"><ProjectSheet q={{ ...rec, items: rec.items || [] }} /></div>}
      {editing && modules?.quotations && (
        <RecordFormModal moduleKey="quotations" mod={modules.quotations} record={rec} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />
      )}
    </div>
  );
}
