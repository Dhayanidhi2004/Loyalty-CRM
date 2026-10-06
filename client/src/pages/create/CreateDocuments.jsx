import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Plus, Save, ShoppingCart, X } from 'lucide-react';
import Shell from '../../components/Shell';
import { Loading } from '../../components/Bits';
import { api, fileUrl } from '../../api';
import { useApp } from '../../AppContext';
import { BRAND } from '../../config';
import { amountInWords } from '../../format';
import { canCreate, canEditRecord, homeFor, levelOf } from '../../access';

// Full-page "Create Purchase Order" and "Proforma Invoice" forms (also used to edit: ?id=<record>).
export const CREATE_PAGES = {
  poRequests: '/purchaseOrder/create',
  pi: '/proformaInvoice/create',
};

const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? 0 : Number(v));
const r2 = (n) => Math.round(n * 100) / 100;
const inr = (v, dp = 2) => `₹ ${num(v).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: 2 })}`;
const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// Back to wherever the user came from (falls back to their dashboard).
function useGoBack() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useApp();
  return () => (location.key !== 'default' ? navigate(-1) : navigate(homeFor(user)));
}

// Loads ?id=… for editing and checks the role may create / edit.
function useDocument(moduleKey) {
  const { user, notify } = useApp();
  const [params] = useSearchParams();
  const id = params.get('id');
  const level = levelOf(user, moduleKey);
  const [record, setRecord] = useState(id ? null : {});
  const [error, setError] = useState('');
  useEffect(() => {
    if (!id) return;
    api(`/records/${moduleKey}/${id}`)
      .then((r) => {
        if (!canEditRecord(level, r, user)) setError("You can't edit this record.");
        setRecord(r);
      })
      .catch((e) => { setError(e.message); notify(e.message, 'error'); });
  }, [id, moduleKey, level, user, notify]);
  const allowed = id ? true : canCreate(level);
  return { id, record, error: error || (allowed ? '' : "Your role can't create this."), level };
}

function BackButton({ onClick }) {
  return <button type="button" className="cd-back" onClick={onClick}><ChevronLeft size={18} /> Back</button>;
}

/* =====================================================================
   Create Purchase Order
   ===================================================================== */
const blankPoRow = () => ({ hsnCode: '', unitDescription: '', description: '', uom: '', quantity: '', unitPrice: '' });

export function CreatePurchaseOrder() {
  const { modules, notify } = useApp();
  const goBack = useGoBack();
  const { id, record, error } = useDocument('poRequests');
  const mod = modules?.poRequests;
  const choices = (key) => mod?.fields.find((f) => f.key === key)?.suggestions || [];
  const [v, setV] = useState(null);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!record || v) return;
    setV({
      products: record.products?.length ? record.products.map((p) => ({ ...blankPoRow(), ...p })) : [blankPoRow()],
      paymentTerms: record.paymentTerms ?? '', warrantyTerms: record.warrantyTerms ?? '', deliveryTerms: record.deliveryTerms ?? '',
      financialYear: record.financialYear ?? '', gst: record.gst ?? '', lp: record.lp ?? '', discount: record.discount ?? '',
      address: record.address ?? '', companyName: record.companyName ?? '', gstin: record.gstin ?? '', refQNo: record.refQNo ?? '',
      qDate: record.qDate ?? '',
    });
  }, [record, v]);

  const totals = useMemo(() => {
    if (!v) return {};
    const total = r2(v.products.reduce((t, p) => t + num(p.quantity) * num(p.unitPrice), 0));
    const gstAmount = r2((total * num(v.gst)) / 100);
    return { total, gstAmount, discount: num(v.discount), final: r2(total + gstAmount - num(v.discount)) };
  }, [v]);

  if (error) return <Shell variant="dark"><div className="cd-wrap"><div className="cd-card"><BackButton onClick={goBack} /><p className="cd-error">{error}</p></div></div></Shell>;
  if (!mod || !v) return <Shell variant="dark"><div className="cd-wrap"><div className="cd-card"><Loading /></div></div></Shell>;

  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const setRow = (i, k) => (e) => setV((s) => ({ ...s, products: s.products.map((p, j) => (j === i ? { ...p, [k]: e.target.value } : p)) }));
  const removeRow = (i) => setV((s) => ({ ...s, products: s.products.filter((_, j) => j !== i) }));

  async function submit(e) {
    e.preventDefault();
    setMsg('');
    const rows = v.products.filter((p) => Object.values(p).some((x) => String(x ?? '').trim() !== ''));
    if (!rows.length) return setMsg('Add at least one product.');
    if (rows.some((p) => !String(p.description || p.unitDescription || '').trim() || num(p.quantity) <= 0)) return setMsg('Each product needs a description and a quantity.');
    if (!v.companyName.trim()) return setMsg('Enter the Customer Name.');
    if (v.financialYear.trim() && !/^\d{2}-\d{2}$/.test(v.financialYear.trim())) return setMsg('Financial Year must look like 26-27.');
    setSaving(true);
    try {
      const body = { ...v, products: rows, financialYear: v.financialYear.trim() };
      const saved = await api(id ? `/records/poRequests/${id}` : '/records/poRequests', { method: id ? 'PUT' : 'POST', body });
      notify(`Purchase order ${saved.docNumber} ${id ? 'updated' : 'created'}`);
      goBack();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setSaving(false);
    }
  }

  const termSelect = (k, label) => {
    const opts = choices(k);
    const value = v[k];
    return (
      <div className="cd-fld">
        <label htmlFor={`po-${k}`}>{label}</label>
        <select id={`po-${k}`} className={`cd-input${value ? '' : ' empty'}`} value={value} onChange={set(k)}>
          <option value="">Select option</option>
          {value && !opts.includes(value) && <option>{value}</option>}
          {opts.map((o) => <option key={o}>{o}</option>)}
        </select>
      </div>
    );
  };

  return (
    <Shell variant="dark">
      <div className="cd-wrap">
        <form className="cd-card" onSubmit={submit} noValidate>
          <div className="cd-head">
            <BackButton onClick={goBack} />
            <h1><ShoppingCart size={30} /> {id ? `Edit Purchase Order ${record.docNumber || ''}` : 'Create Purchase Order'}</h1>
            <span />
          </div>

          <div className="cd-table-wrap">
            <table className="cd-table">
              <thead>
                <tr><th>HSN Code</th><th>UnitDescription</th><th>Description</th><th>UOM</th><th>Qty</th><th>Unit Price</th><th className="r">Total</th><th aria-label="Remove" /></tr>
              </thead>
              <tbody>
                {v.products.map((p, i) => (
                  <tr key={i}>
                    <td><input className="cd-cell" placeholder="HSN Code" aria-label="HSN Code" value={p.hsnCode} onChange={setRow(i, 'hsnCode')} /></td>
                    <td><input className="cd-cell" placeholder="Unit Description" aria-label="Unit Description" value={p.unitDescription} onChange={setRow(i, 'unitDescription')} /></td>
                    <td><input className="cd-cell" placeholder="Description" aria-label="Description" value={p.description} onChange={setRow(i, 'description')} /></td>
                    <td><input className="cd-cell sm" placeholder="UOM" aria-label="UOM" value={p.uom} onChange={setRow(i, 'uom')} /></td>
                    <td><input className="cd-cell sm" type="number" min="0" placeholder="0" aria-label="Qty" value={p.quantity} onChange={setRow(i, 'quantity')} /></td>
                    <td><input className="cd-cell sm" type="number" min="0" step="0.01" placeholder="0" aria-label="Unit Price" value={p.unitPrice} onChange={setRow(i, 'unitPrice')} /></td>
                    <td className="r cd-amt">{inr(num(p.quantity) * num(p.unitPrice))}</td>
                    <td>{v.products.length > 1 && <button type="button" className="cd-x" aria-label="Remove product" onClick={() => removeRow(i)}><X size={16} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="cd-add" onClick={() => setV((s) => ({ ...s, products: [...s.products, blankPoRow()] }))}><Plus size={20} /> Add Product</button>

          <div className="cd-3">
            {termSelect('paymentTerms', 'Payment Terms')}
            {termSelect('warrantyTerms', 'Warranty Terms')}
            {termSelect('deliveryTerms', 'Delivery Terms')}
          </div>

          <div className="cd-2">
            <div>
              <div className="cd-fld">
                <label htmlFor="po-fy">Financial Year</label>
                <input id="po-fy" className="cd-input" placeholder="e.g., 24-25" value={v.financialYear} onChange={set('financialYear')} />
              </div>
              <div className="cd-fld">
                <label htmlFor="po-gst">GST (%)</label>
                <input id="po-gst" className="cd-input" type="number" min="0" step="0.01" placeholder="0" value={v.gst} onChange={set('gst')} />
              </div>
            </div>
            <aside className="cd-summary">
              <h3>Order Summary</h3>
              <div className="row muted"><span>Total</span><span>{inr(totals.total, 0)}</span></div>
              <div className="row gst"><span>GST ({num(v.gst)}%)</span><span>+ {inr(totals.gstAmount, 0)}</span></div>
              {totals.discount > 0 && <div className="row disc"><span>Discount</span><span>− {inr(totals.discount, 0)}</span></div>}
              <div className="row final"><span>Final Total</span><span>{inr(totals.final, 0)}</span></div>
            </aside>
          </div>

          <div className="cd-fld"><label htmlFor="po-lp">LP</label><input id="po-lp" className="cd-input dark" placeholder="Enter LP (if any)" value={v.lp} onChange={set('lp')} /></div>
          <div className="cd-fld"><label htmlFor="po-disc">Discount</label><input id="po-disc" className="cd-input dark" type="number" min="0" step="0.01" placeholder="Enter Discount (if any)" value={v.discount} onChange={set('discount')} /></div>
          <div className="cd-fld"><label htmlFor="po-addr">Address Details</label><textarea id="po-addr" className="cd-input dark" rows={3} value={v.address} onChange={set('address')} /></div>
          <div className="cd-fld"><label htmlFor="po-cust">Customer Name <i>*</i></label><input id="po-cust" className="cd-input dark" value={v.companyName} onChange={set('companyName')} /></div>
          <div className="cd-fld"><label htmlFor="po-gstin">GSTIN/UIN</label><input id="po-gstin" className="cd-input dark" value={v.gstin} onChange={set('gstin')} /></div>
          <div className="cd-fld"><label htmlFor="po-refq">RefQNo</label><input id="po-refq" className="cd-input dark" value={v.refQNo} onChange={set('refQNo')} /></div>
          <div className="cd-fld"><label htmlFor="po-qdate">QDate</label><input id="po-qdate" className="cd-input dark" type="date" value={v.qDate} onChange={set('qDate')} /></div>

          {msg && <div className="form-error" role="alert">{msg}</div>}
          <button className="cd-submit" disabled={saving}><Save size={20} /> {saving ? 'Saving…' : id ? 'Save Purchase Order' : 'Submit Purchase Order'}</button>
        </form>
      </div>
    </Shell>
  );
}

/* =====================================================================
   Proforma Invoice
   ===================================================================== */
const blankPiRow = () => ({ itemName: '', unitDescription: '', uom: '', quantity: '', unitPrice: '' });

function LogoMark() {
  const [failed, setFailed] = useState(false);
  if (!failed) return <img className="pf-logo" src={fileUrl(BRAND.invoiceLogoUrl || BRAND.logoUrl)} alt="" onError={() => setFailed(true)} />;
  return <span className="pf-logo-badge">{BRAND.logoInitials}</span>;
}

// Image that disappears when the file isn't there (stamp, brand logos in client/public)
function OptionalImg({ src, className, fallback = null }) {
  const [failed, setFailed] = useState(false);
  if (failed) return fallback;
  return <img className={className} src={fileUrl(src)} alt="" onError={() => setFailed(true)} />;
}

// Company letterhead at the top of every proforma invoice (form, view and PDF)
export function PiLetterhead() {
  return (
    <>
      <header className="pf-brand">
        <LogoMark />
        <div>
          <h1>{BRAND.legalName}</h1>
          <p>{BRAND.address}</p>
          <p>Ph: {BRAND.phone} Mail id:{BRAND.email}</p>
        </div>
      </header>
      <div className="pf-gst">GST:{BRAND.gstin}</div>
      <h2 className="pf-title">PROFORMA INVOICE</h2>
    </>
  );
}

// Signatory, stamp, contact lines and brand logos at the bottom
export function PiFooter() {
  return (
    <>
      <footer className="pf-sign">
        <b>FOR {BRAND.legalName}</b>
        <OptionalImg src={BRAND.stampUrl} className="pf-stamp-img" fallback={<span className="pf-stamp" aria-hidden="true">{BRAND.logoInitials}</span>} />
        <b>Authorised Signatory</b>
      </footer>
      <div className="pf-foot">
        <p>Contact No: {BRAND.footerPhone} Email: {BRAND.footerEmails} Website: {BRAND.website}</p>
        <p>Regd Office: {BRAND.regdOffice}</p>
        <p><b>GSTIN: {BRAND.gstin}</b></p>
        {BRAND.partnerLogos?.length > 0 && (
          <div className="pf-partners">{BRAND.partnerLogos.map((src) => <OptionalImg key={src} src={src} className="pf-partner" />)}</div>
        )}
      </div>
    </>
  );
}

// Read-only proforma invoice in the same format as the form (used by the PDF / print page)
export function PiSheet({ pi }) {
  const items = pi.items || [];
  const dmy = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('-') : '');
  const discountAmt = r2((num(pi.itemsTotal) * num(pi.discount)) / 100);
  return (
    <div className="pf-doc pf-sheet">
      <PiLetterhead />
      <div className="pf-meta">
        <label><b>PI No:</b> <span>{pi.piNumber}</span></label>
        <label><b>PI Date:</b> <span>{dmy(pi.piDate || pi.createdAt)}</span></label>
        <label><b>Ref No:</b> <span>{pi.yourRef || ''}</span></label>
        <label><b>Ref Date:</b> <span>{dmy(pi.refDate)}</span></label>
      </div>
      <div className="pf-meta po">
        <label><b>PO No:</b> <span>{pi.poNo || ''}</span></label>
        <label><b>PO Date:</b> <span>{dmy(pi.poDate)}</span></label>
      </div>
      <section className="pf-consignee">
        <div>
          <div className="pf-cap">CONSIGNEE</div>
          <div className="pf-name">{pi.customerName}</div>
        </div>
        <div className="pf-cons-right">
          <div className="pf-addr">{pi.address}</div>
          <label><b>GSTIN:</b> <span>{pi.gstin || ''}</span></label>
          <label>State: <span>{pi.state || ''}</span></label>
        </div>
      </section>
      <table className="pf-items">
        <thead><tr><th>S.No</th><th>Product</th><th>Unit Description</th><th>UOM</th><th className="r">Qty</th><th className="r">Unit Price</th><th className="r">Total</th></tr></thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td className="sno">{i + 1}</td><td className="txt">{it.itemName}</td><td className="txt">{it.unitDescription || ''}</td><td className="txt">{it.uom || ''}</td>
              <td className="r txt">{it.quantity}</td><td className="r txt">{num(it.unitPrice).toLocaleString('en-IN')}</td><td className="r tot">{inr(it.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pf-bottom">
        <div className="pf-terms">
          <h4>Terms &amp; Conditions:</h4>
          <p>1. Goods once sold will {pi.goodsReturn === 'No' ? 'not be taken back' : 'be taken back'}.</p>
          <p>2. Interest @ {pi.interestRate ?? 24}% p.a. will be charged if the payment is not made in the stipulated time.</p>
          <p>3. Subject to {pi.jurisdiction || BRAND.jurisdiction} Jurisdiction only.</p>
          <p>4. Certified that the particulars given above are {pi.certification === 'No' ? 'Not verified' : 'True'}.</p>
          {num(pi.lpAmount) > 0 && <p><b>LP:</b> {inr(pi.lpAmount)}</p>}
        </div>
        <div className="pf-sum">
          <div><span>Sub Total:</span><span>{inr(pi.itemsTotal, 0)}</span></div>
          {discountAmt > 0 && <div><span>Discount ({num(pi.discount)}%):</span><span>− {inr(discountAmt)}</span></div>}
          <div><span>Freight:</span><span>{inr(pi.freight, 0)}</span></div>
          <div><span>GST Amount ( {num(pi.gst)} %):</span><span>{inr(pi.gstAmount)}</span></div>
          <div><span>Round Off:</span><span>{inr(pi.roundOff)}</span></div>
          <div className="grand"><span>TOTAL:</span><span>{inr(pi.totalPayable)}</span></div>
          <div className="words"><b>Amount In Words:</b><b>{amountInWords(pi.totalPayable)}</b></div>
        </div>
      </div>
      <PiFooter />
    </div>
  );
}

export function CreateProformaInvoice() {
  const { user, notify } = useApp();
  const goBack = useGoBack();
  const { id, record, error } = useDocument('pi');
  const [v, setV] = useState(null);
  const [pos, setPos] = useState([]);
  const [msg, setMsg] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Purchase orders this user can see, for the PO No picker
  useEffect(() => {
    if (!levelOf(user, 'poRequests')) return;
    api('/records/poRequests?limit=500').then((r) => setPos(r.items)).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!record || v) return;
    setV({
      piDate: record.piDate ?? today(), yourRef: record.yourRef ?? '', refDate: record.refDate ?? '',
      poNo: record.poNo ?? '', poDate: record.poDate ?? '',
      customerName: record.customerName ?? '', address: record.address ?? '', gstin: record.gstin ?? '', state: record.state ?? BRAND.state,
      phone: record.phone ?? '',
      items: record.items?.length ? record.items.map((it) => ({ ...blankPiRow(), ...it })) : [blankPiRow()],
      goodsReturn: record.goodsReturn ?? 'Yes', interestRate: record.interestRate ?? 24, jurisdiction: record.jurisdiction ?? BRAND.jurisdiction,
      certification: record.certification ?? 'Yes', lpAmount: record.lpAmount ?? '', discount: record.discount ?? '',
      freight: record.freight ?? '', gst: record.gst ?? 18,
      paymentTerms: record.paymentTerms ?? '', delivery: record.delivery ?? '',
    });
  }, [record, v]);

  // Same calculation as the server (routes/records.js TOTALS.pi)
  const t = useMemo(() => {
    if (!v) return {};
    const itemsTotal = r2(v.items.reduce((s, it) => s + num(it.quantity) * num(it.unitPrice), 0));
    const discountAmt = r2((itemsTotal * num(v.discount)) / 100);
    const subtotal = r2(itemsTotal - discountAmt + num(v.freight));
    const gstAmount = r2((subtotal * num(v.gst)) / 100);
    const exact = r2(subtotal + gstAmount);
    const total = Math.round(exact);
    return { itemsTotal, discountAmt, subtotal, gstAmount, roundOff: r2(total - exact), total };
  }, [v]);

  if (error) return <Shell variant="dark" tinted><div className="pf-page"><div className="pf-doc"><BackButton onClick={goBack} /><p className="cd-error">{error}</p></div></div></Shell>;
  if (!v) return <Shell variant="dark" tinted><div className="pf-page"><div className="pf-doc"><Loading /></div></div></Shell>;

  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const setRow = (i, k) => (e) => setV((s) => ({ ...s, items: s.items.map((it, j) => (j === i ? { ...it, [k]: e.target.value } : it)) }));
  const filled = (it) => Object.values(it).some((x) => String(x ?? '').trim() !== '');
  const rows = v.items.filter(filled);
  const ready = v.customerName.trim() && rows.length > 0;

  // Picking a known PO fills the PO date and, where still empty, the consignee and the items.
  function pickPo(e) {
    const poNo = e.target.value;
    setV((s) => ({ ...s, poNo }));
    const po = pos.find((p) => p.docNumber === poNo);
    if (!po) return setNote('');
    setV((s) => ({
      ...s,
      poNo,
      poDate: (po.createdAt || '').slice(0, 10) || s.poDate,
      customerName: s.customerName || po.companyName || '',
      address: s.address || po.address || '',
      gstin: s.gstin || po.gstin || '',
      gst: po.gst ?? s.gst,
      items: s.items.some(filled) ? s.items : (po.products || []).map((p) => ({
        itemName: p.description || p.unitDescription || '', unitDescription: p.unitDescription || '', uom: p.uom || '',
        quantity: p.quantity ?? '', unitPrice: p.unitPrice ?? '',
      })),
      paymentTerms: s.paymentTerms || po.paymentTerms || '',
      delivery: s.delivery || po.deliveryTerms || '',
    }));
    setNote(`Filled from ${po.docNumber} (${po.companyName}). Check the details below.`);
  }

  async function submit() {
    setMsg('');
    if (!v.customerName.trim()) return setMsg('Enter the customer name.');
    if (!rows.length) return setMsg('Add at least one product.');
    if (rows.some((it) => !String(it.itemName).trim() || num(it.quantity) <= 0)) return setMsg('Each row needs a product and a quantity.');
    setSaving(true);
    try {
      const saved = await api(id ? `/records/pi/${id}` : '/records/pi', { method: id ? 'PUT' : 'POST', body: { ...v, items: rows } });
      notify(`Proforma invoice ${saved.piNumber} ${id ? 'updated' : 'created'}`);
      goBack();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Shell variant="dark" tinted>
      <div className="pf-page">
        <div className="pf-tools"><BackButton onClick={goBack} /></div>
        <div className="pf-doc">
          <PiLetterhead />

          <div className="pf-meta">
            <label><b>PI No:</b> <span>{id ? record.piNumber : 'Will be generated'}</span></label>
            <label><b>PI Date:</b> <input type="date" value={v.piDate} onChange={set('piDate')} /></label>
            <label><b>Ref No:</b> <input value={v.yourRef} onChange={set('yourRef')} aria-label="Ref No" /></label>
            <label><b>Ref Date:</b> <input type="date" value={v.refDate} onChange={set('refDate')} /></label>
          </div>
          <div className="pf-meta po">
            <label>
              <b>PO No:</b>
              <input list="pf-po-list" value={v.poNo} onChange={pickPo} placeholder={pos.length ? 'Pick or type the PO number' : 'Customer PO number'} aria-label="PO No" />
              <datalist id="pf-po-list">{pos.map((p) => <option key={p.id} value={p.docNumber}>{p.companyName}</option>)}</datalist>
            </label>
            <label><b>PO Date:</b> <input type="date" value={v.poDate} onChange={set('poDate')} /></label>
          </div>
          {note && <div className="pf-note">{note}</div>}

          <section className="pf-consignee">
            <div>
              <div className="pf-cap">CONSIGNEE</div>
              <input className="pf-name" placeholder="Enter customer name" value={v.customerName} onChange={set('customerName')} aria-label="Customer name" />
            </div>
            <div className="pf-cons-right">
              <textarea placeholder="Address Line 1, Address Line 2, City, State - PIN" rows={3} value={v.address} onChange={set('address')} aria-label="Address" />
              <label><b>GSTIN:</b> <input placeholder={BRAND.gstin} value={v.gstin} onChange={set('gstin')} aria-label="Customer GSTIN" /></label>
              <label>State: <input value={v.state} onChange={set('state')} aria-label="State" /></label>
            </div>
          </section>

          <div className="pf-items-wrap">
            <table className="pf-items">
              <thead><tr><th>S.No</th><th>Product</th><th>Unit Description</th><th>UOM</th><th className="r">Qty</th><th className="r">Unit Price</th><th className="r">Total</th><th aria-label="Remove" /></tr></thead>
              <tbody>
                {v.items.map((it, i) => (
                  <tr key={i}>
                    <td className="sno">{i + 1}</td>
                    <td><input value={it.itemName} onChange={setRow(i, 'itemName')} aria-label={`Product ${i + 1}`} /></td>
                    <td><input value={it.unitDescription} onChange={setRow(i, 'unitDescription')} aria-label={`Unit description ${i + 1}`} /></td>
                    <td><input value={it.uom} onChange={setRow(i, 'uom')} aria-label={`UOM ${i + 1}`} /></td>
                    <td><input className="r" type="number" min="0" value={it.quantity} onChange={setRow(i, 'quantity')} aria-label={`Qty ${i + 1}`} /></td>
                    <td><input className="r" type="number" min="0" step="0.01" value={it.unitPrice} onChange={setRow(i, 'unitPrice')} aria-label={`Unit price ${i + 1}`} /></td>
                    <td className="r tot">{inr(num(it.quantity) * num(it.unitPrice)).replace(' ', ' ')}</td>
                    <td><button type="button" className="pf-x" aria-label={`Remove row ${i + 1}`} disabled={v.items.length === 1}
                      onClick={() => setV((s) => ({ ...s, items: s.items.filter((_, j) => j !== i) }))}><X size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="pf-addrow" onClick={() => setV((s) => ({ ...s, items: [...s.items, blankPiRow()] }))}>+ Add Row</button>

          <div className="pf-bottom">
            <div className="pf-terms">
              <h4>Terms &amp; Conditions:</h4>
              <p>1. Goods once sold will{' '}
                <select value={v.goodsReturn} onChange={set('goodsReturn')} aria-label="Goods return">
                  <option value="Yes">be taken back</option>
                  <option value="No">not be taken back</option>
                </select> .
              </p>
              <p>2. Interest @ <input className="w60" type="number" min="0" step="0.01" value={v.interestRate} onChange={set('interestRate')} aria-label="Interest rate" />% p.a. will be charged if the payment is not made in the stipulated time.</p>
              <p>3. Subject to <input className="w110" value={v.jurisdiction} onChange={set('jurisdiction')} aria-label="Jurisdiction" /> Jurisdiction only.</p>
              <p>4. Certified that the particulars given above are{' '}
                <select value={v.certification} onChange={set('certification')} aria-label="Certification">
                  <option value="Yes">True</option>
                  <option value="No">Not verified</option>
                </select>.
              </p>
              <div className="pf-fld"><label htmlFor="pf-lp">LP (if any):</label><input id="pf-lp" type="number" min="0" step="0.01" placeholder="Enter LP value (if any)" value={v.lpAmount} onChange={set('lpAmount')} /></div>
              <div className="pf-fld"><label htmlFor="pf-disc">Discount (if any):</label><div className="pf-pct"><input id="pf-disc" type="number" min="0" max="100" step="0.01" placeholder="Enter Discount value (if any)" value={v.discount} onChange={set('discount')} /><span>%</span></div></div>
            </div>
            <div className="pf-sum">
              <div><span>Sub Total:</span><span>{inr(t.itemsTotal, 0)}</span></div>
              {t.discountAmt > 0 && <div><span>Discount ({num(v.discount)}%):</span><span>− {inr(t.discountAmt)}</span></div>}
              <div><span>Freight:</span><input className="pf-freight" type="number" min="0" step="0.01" placeholder="0" value={v.freight} onChange={set('freight')} aria-label="Freight" /></div>
              <div><span>GST Amount ( <input className="w44" type="number" min="0" step="0.01" value={v.gst} onChange={set('gst')} aria-label="GST percent" /> %):</span><span>{inr(t.gstAmount)}</span></div>
              <div><span>Round Off:</span><span>{inr(t.roundOff)}</span></div>
              <div className="grand"><span>TOTAL:</span><span>{inr(t.total)}</span></div>
              <div className="words"><b>Amount In Words:</b><b>{t.total > 0 ? amountInWords(t.total) : 'Amount in words will be generated'}</b></div>
            </div>
          </div>

          <PiFooter />

          {msg && <div className="form-error" role="alert" style={{ margin: '0 20px 16px' }}>{msg}</div>}
          <div className="pf-actions">
            <button type="button" className={`pf-create${ready ? ' on' : ''}`} disabled={saving} onClick={submit}>
              {saving ? 'Saving…' : id ? 'Save Invoice' : 'Create Invoice'}
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}
