import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Search } from 'lucide-react';
import Shell from '../components/Shell';
import SalesShell from '../components/SalesShell';
import { BackPill, Loading } from '../components/Bits';
import { Panel } from './sales/SalesPages';
import { api } from '../api';
import { useApp } from '../AppContext';
import { canCreate, canDelete, levelOf } from '../access';
import './project-quotations.css';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const money = (n) => Number(n || 0).toFixed(2);

// Everything printed on the sheet is editable. These are what a quotation shows until it is changed.
const DEF = {
  co: 'LOYALTY AUTOMATION PVT.LTD.',
  coAddr: 'No. 27/1,Vaigai Colony 2nd Street, 12th Avenue Ashok Nagar,Ch-83.',
  coContact: 'Ph: 044 43838063, 9551687011 Mail id:loyaltyautomation@gmail.com',
  gstin: 'GST:33AACCL4592K1ZA',
  kind: 'Refer to your above enquiry, please find below our best offer for your requirements\nfor your kind persual.',
  hsn: '8536', uom: 'Set', qty: 1, bomLabel: 'BOM',
  disc: 'Discounted Price.',
  bank: 'Company Name : LOYALTY AUTOMATION PVT LTD.\nBank Name : PUNJAB NATIONAL BANK\nBranch : NANDANAM\nAccount No : 4389002100015380\nRTGS/NEFT IFSC Code : PUNB0438900\nType of Account : CURRENT',
  thanks: 'We now look forward to the pleasure of receiving your valued order',
  support: 'We provide Site, Programming & Service support for all Brands',
};
const val = (q, k) => (q[k] ?? DEF[k] ?? '');
// price is the unit price of the set; total = price x qty, GST on the total.
const calc = (q) => {
  const qty = Number(val(q, 'qty')) || 0;
  const sub = Math.round((q.price || 0) * qty * 100) / 100;
  const g = Math.round((sub * (q.gst || 0)) / 100);
  return { g, t: sub + g, sub };
};
const blank = (e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } };
const NUM = ['price', 'gst', 'qty'];
const newQuotation = () => {
  const d = new Date();
  const date = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  return { id: 'new', ref: '', date, cust: '', addr: '', proj: '', price: 0, gst: 18, qty: 1, delivery: '', pay: '100% Advance', valid: '1 week from the date of quotation', warr: '1 year from the date of supply', note: '', items: [{ d: '', q: 1, u: 'Nos', h: '8536' }] };
};

// Any name: customer / project / ref no first; if none match, any requirement inside a quotation.
function findQuotations(items, term) {
  const words = term.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const head = (q) => [q.proj, q.cust, q.ref, q.addr].join(' ').toLowerCase();
  const full = (q) => `${head(q)} ${q.items.map((i) => i.d).join(' ').toLowerCase()}`;
  let list = items.filter((q) => words.every((w) => head(q).includes(w)));
  if (!list.length) list = items.filter((q) => words.every((w) => full(q).includes(w)));
  return { list, words };
}

// The quotation laid out like the Loyalty Automation commercial offer. In edit mode every piece of text on the
// sheet itself becomes editable (no separate form); grab() in the page reads it back.
function Sheet({ q, ed, hl, onRemove, onMove, onInsert, onCust, onNum }) {
  const c = calc(q);
  // k = field, p = placeholder, ml = may hold several lines (Enter makes a new line)
  const E = (k, p, ml) => (ed
    ? <span className={`pq-ce${ml ? ' pq-ml' : ''}`} contentEditable="plaintext-only" suppressContentEditableWarning data-k={k} data-p={p || ''} onKeyDown={ml ? undefined : blank} onBlur={k === 'cust' ? onCust : NUM.includes(k) ? onNum : undefined}>{String(val(q, k))}</span>
    : <span className={ml ? 'pq-ml' : undefined}>{String(val(q, k))}</span>);
  const C = (n, f, v) => (ed
    ? <span className="pq-ce" contentEditable="plaintext-only" suppressContentEditableWarning data-i={n} data-f={f} onKeyDown={blank}>{String(v ?? '')}</span>
    : <>{String(v ?? '')}</>);
  const hit = (i) => hl && hl.some((w) => i.d.toLowerCase().includes(w));
  const last = q.items.length - 1;
  return (
    <div className="pq-sheet"><div className="pq-pdf">
      <div className="pq-cof">COMMERCIAL OFFER</div>
      <div className="pq-lg"><i>LA</i><div className="pq-c"><h2>{E('co', 'company name')}</h2><p>{E('coAddr', 'company address', true)}</p><p>{E('coContact', 'phone / mail', true)}</p></div></div>
      <div className="pq-gs">{E('gstin', 'GST number')}</div>
      <div className="pq-cg">
        <div><div className="pq-b" style={{ fontSize: 15 }}>Consignee :</div><div className="pq-b" style={{ margin: '4px 0 0 28px' }}>{E('cust', 'customer name')}<br />{E('addr', 'address', true)}</div></div>
        <div><div><b>Our Ref . No</b> : {E('ref', 'ref no')}</div><div style={{ marginTop: 6 }}><b>Date</b> : {E('date', 'dd-mm-yyyy')}</div></div>
      </div>
      <div className="pq-ka">Kind Attn :<p>{E('kind', 'covering note', true)}</p></div>
      <table className="pq-pt"><thead><tr><th>S. No</th><th>HSN Code</th><th>Unit Description</th><th>UOM</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
        <tbody>
          <tr className="pq-rw"><td>1</td><td className="vl">{E('hsn', 'HSN')}</td><td className="vl">{E('proj', 'project name')}</td><td className="vl">{E('uom', 'UOM')}</td><td className="vl">{E('qty', 'qty')}</td><td className="vl">{ed ? E('price', 'unit price') : (q.price || '')}</td><td className="vl">{q.price ? money(c.sub) : '0.00'}</td></tr>
          <tr><td /><td className="vl" /><td className="vl pq-b">{E('bomLabel', 'heading')}</td><td className="vl" /><td className="vl" /><td className="vl" /><td className="vl" /></tr>
          {q.items.map((i, n) => (
            <tr key={n}>
              <td>{ed && (
                <span className="pq-rc">
                  <button type="button" className="pq-x" title="Remove row" onClick={() => onRemove(n)}>✕</button>
                  <button type="button" className="pq-m" title="Move up" disabled={n === 0} onClick={() => onMove(n, -1)}>↑</button>
                  <button type="button" className="pq-m" title="Move down" disabled={n === last} onClick={() => onMove(n, 1)}>↓</button>
                  <button type="button" className="pq-m" title="Insert row below" onClick={() => onInsert(n)}>+</button>
                </span>
              )}</td>
              <td className="vl pq-b">{C(n, 'h', i.h)}</td>
              <td className={`vl pq-bd${hit(i) ? ' pq-hit' : ''}`}>{C(n, 'd', i.d)}</td>
              <td className="vl">{C(n, 'u', i.u)}</td>
              <td className="vl">{C(n, 'q', i.q)}</td>
              <td className="vl" /><td className="vl" />
            </tr>
          ))}
        </tbody>
      </table>
      {(q.note || ed) && <div className="pq-note">Note: {E('note', 'add note', true)}</div>}
      <div className="pq-ft">
        <div className="pq-tc"><div className="pq-t">Terms&amp;Conditions:</div><div className="pq-b">Discount : {E('disc', 'discount')}</div>
          {(q.delivery || ed) && <div className="pq-b">Delivery : {E('delivery', 'add delivery')}</div>}
          <div className="pq-b pq-y">Payment : {E('pay', 'payment terms')}</div><div className="pq-b">Validity : {E('valid', 'validity')}</div><div className="pq-b">Warranty : {E('warr', 'warranty')}</div></div>
        <div className="pq-tt"><div><span>{q.price ? money(c.sub) : ''}</span></div><div><span>Gst @ {E('gst', '18')}%</span><span>{q.price ? c.g : 'Extra'}</span></div><div><span>Total Amount</span><span>{q.price ? c.t : '—'}</span></div></div>
      </div>
      <div className="pq-ft" style={{ borderTop: 0 }}><div className="pq-bk"><span className="pq-bkh">Bank Details :</span><br />{E('bank', 'bank details', true)}</div><div /></div>
      <div className="pq-pk">{E('thanks', 'closing line', true)}</div>
      <div className="pq-dl">Authorised Dealers of <s style={{ color: '#2e9a3e' }}>Schneider Electric</s><s style={{ color: '#1976d2' }}>▲DELTA</s><s style={{ color: '#222' }}>PHŒNIX CONTACT</s><s style={{ color: '#1a3a8a' }}>MOTOVARIO</s></div>
      <div className="pq-rd">{E('support', 'support line', true)}</div>
    </div></div>
  );
}

export default function ProjectQuotationsPage() {
  const { user, notify } = useApp();
  const navigate = useNavigate();
  const level = levelOf(user, 'quotations');
  const sales = user.dashboard === 'sales';
  const back = sales ? '/SaleteamDasboard/quotations' : '/admin/records/quotations';
  const mayEdit = canCreate(level);
  const mayDelete = canDelete(level);
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [term, setTerm] = useState('');
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState(null); // the quotation being edited, in place
  const [saving, setSaving] = useState(false);
  const root = useRef(null);

  useEffect(() => {
    if (!level) return;
    api('/project-quotations').then((r) => setItems(r.items)).catch((e) => { setError(e.message); setItems([]); });
  }, [level]);

  const found = useMemo(() => (items ? findQuotations(items, term) : null), [items, term]);

  // Reads what is typed on the sheet back into the draft.
  function grab() {
    const d = { ...draft, items: draft.items.map((i) => ({ ...i })) };
    root.current.querySelectorAll('[data-k]').forEach((e) => {
      const k = e.dataset.k; const v = e.textContent.replace(/\u00a0/g, ' ').trim();
      d[k] = NUM.includes(k) ? parseFloat(v.replace(/[^0-9.]/g, '')) || 0 : v;
    });
    root.current.querySelectorAll('[data-i]').forEach((e) => {
      const i = d.items[e.dataset.i]; const f = e.dataset.f; const v = e.textContent.trim();
      i[f] = f === 'q' ? parseFloat(v) || 0 : v;
    });
    return d;
  }
  const startEdit = (q) => { setOpenId((o) => (term.trim() ? o : q.id)); setDraft(JSON.parse(JSON.stringify(q))); };
  const removeRow = (n) => { const d = grab(); d.items.splice(n, 1); setDraft(d); };
  const addRow = () => { const d = grab(); d.items.push({ d: '', q: 1, u: 'Nos', h: '8536' }); setDraft(d); };
  const insertRow = (n) => { const d = grab(); d.items.splice(n + 1, 0, { d: '', q: 1, u: d.items[n]?.u || 'Nos', h: d.items[n]?.h || '8536' }); setDraft(d); };
  const moveRow = (n, by) => { const d = grab(); const m = n + by; if (m < 0 || m >= d.items.length) return; [d.items[n], d.items[m]] = [d.items[m], d.items[n]]; setDraft(d); };
  // Typing nk / rambal / lnt as the customer fills the full name and address of that customer.
  function onCust(e) {
    const v = e.currentTarget.textContent.trim().toLowerCase();
    if (v.length < 2 || v === (draft.cust || '').toLowerCase()) return;
    const m = items.find((x) => x.cust.toLowerCase().includes(v));
    if (!m) return;
    e.currentTarget.textContent = m.cust;
    const ad = root.current.querySelector('[data-k="addr"]');
    if (ad) ad.textContent = m.addr;
  }
  // Price / Qty / GST: tidy what was typed and refresh the totals straight away (no need to save first).
  function onNum(e) {
    const k = e.currentTarget.dataset.k; const n = parseFloat(e.currentTarget.textContent.replace(/[^0-9.]/g, '')) || 0;
    e.currentTarget.textContent = String(n);
    const d = grab(); d[k] = n; setDraft(d);
  }
  async function save() {
    const d = grab();
    if (!d.cust) { notify('Customer is required', 'error'); return; }
    setSaving(true);
    try {
      const isNew = d.id === 'new';
      const saved = await api(isNew ? '/project-quotations' : `/project-quotations/${d.id}`, { method: isNew ? 'POST' : 'PUT', body: d });
      setItems((l) => (isNew ? [...l, saved] : l.map((x) => (x.id === saved.id ? saved : x))));
      if (isNew) setOpenId(saved.id);
      setDraft(null);
      notify(isNew ? 'Quotation added' : 'Quotation updated');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }
  // A new blank quotation, or a copy of an existing one, opens straight in edit mode; nothing is stored until Save.
  function startNew(from) {
    const d = from ? { ...JSON.parse(JSON.stringify(from)), id: 'new', ref: '' } : newQuotation();
    delete d.updatedAt;
    setTerm('');
    setOpenId('new');
    setDraft(d);
  }
  async function remove(q) {
    if (!window.confirm(`Delete the quotation for ${q.cust}${q.proj ? ` — ${q.proj}` : ''}? This cannot be undone.`)) return;
    try {
      await api(`/project-quotations/${q.id}`, { method: 'DELETE' });
      setItems((l) => l.filter((x) => x.id !== q.id));
      setOpenId(null);
      setDraft(null);
      notify('Quotation deleted');
    } catch (e) {
      notify(e.message, 'error');
    }
  }
  const cancel = () => { if (draft?.id === 'new') setOpenId(null); setDraft(null); };

  const bar = (q) => (draft?.id === q.id ? (
    <>
      <button className="view-more" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</button>
      <button className="back-list" onClick={addRow}>+ Add item</button>
      <button className="back-list" onClick={cancel}>Cancel</button>
    </>
  ) : (
    <>
      {openId !== q.id && <button className="view-more" onClick={() => setOpenId(q.id)}>Open</button>}
      {mayEdit && <button className="view-more" onClick={() => startEdit(q)}>Edit</button>}
      {mayEdit && <button className="back-list" onClick={() => startNew(q)}>Duplicate</button>}
      {mayDelete && <button className="back-list pq-del" onClick={() => remove(q)}>Delete</button>}
    </>
  ));
  const sheet = (q, hl) => (draft?.id === q.id
    ? <Sheet q={draft} ed onRemove={removeRow} onMove={moveRow} onInsert={insertRow} onCust={onCust} onNum={onNum} />
    : <Sheet q={q} hl={hl} />);

  let content;
  if (!level) content = <div className="pq-empty">Your role doesn't have access to quotations.</div>;
  else if (items === null) content = <Loading />;
  else if (error) content = <div className="pq-empty">{error}</div>;
  else {
    const open = openId === 'new' ? draft : items.find((x) => x.id === openId);
    content = (
      <div ref={root}>
        {open ? (
          <>
            <div className="pq-bar"><button className="back-list" onClick={() => { setOpenId(null); setDraft(null); }}>‹ Back to List</button>{bar(open)}</div>
            {sheet(open)}
          </>
        ) : (
          <>
            {mayEdit && <div className="pq-bar"><button className="view-more" onClick={() => startNew()}>+ New quotation</button></div>}
            <div className="sp-search">
              <Search size={22} />
              <input placeholder="Search any name — customer, project, ref no or requirement (e.g. nk, plc panel control, vfd)" value={term} onChange={(e) => { setTerm(e.target.value); setDraft(null); }} />
            </div>
            {found ? (
              <>
                <div className="pq-count">{found.list.length} quotation{found.list.length === 1 ? '' : 's'} found for “{term}”</div>
                {found.list.length === 0 && <div className="pq-empty">No quotation found.</div>}
                {found.list.map((q) => (
                  <section key={q.id} className="pq-result">
                    <div className="pq-bar"><h3>{q.cust} — {q.proj}</h3>{bar(q)}</div>
                    {sheet(q, found.words)}
                  </section>
                ))}
              </>
            ) : (
              <div className="doc-grid" style={{ marginTop: 0 }}>
                {items.map((q) => (
                  <article key={q.id} className="doc-card">
                    <header className="doc-head q">
                      <div style={{ minWidth: 0, flex: '1 1 220px' }}><h4 style={{ lineHeight: 1.3 }}>{q.cust}</h4><div className="q-ref">Reference No: <b>{q.ref}</b></div></div>
                      <span className="pill-lav">Project</span>
                    </header>
                    <div className="doc-body">
                      <div className="q-grid">
                        <div><div className="doc-lbl">Project</div><div className="q-box">{q.proj}</div></div>
                        <div><div className="doc-lbl">Date</div><div className="q-box">{q.date}</div></div>
                        <div><div className="doc-lbl">Total Payable Amount</div><div className="q-box">{q.price ? inr(calc(q).t) : 'Not priced'}</div></div>
                        <div><div className="doc-lbl">Validity</div><div className="q-box">{q.valid || '—'}</div></div>
                      </div>
                      <div className="pq-bar" style={{ marginTop: 30 }}>{bar(q)}</div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  if (sales) {
    return (
      <SalesShell subtitle="Project Quotations" back={back}>
        <Panel title="Project Quotations" icon={FileText}>{content}</Panel>
      </SalesShell>
    );
  }
  return (
    <Shell>
      <div className="page bg-soft"><div className="page-inner">
        <div className="head-row center-title"><div><BackPill to={back} /></div><h1 className="title-mgmt">Project Quotations</h1><div className="head-actions" /></div>
        <div style={{ marginTop: 30 }}>{content}</div>
      </div></div>
    </Shell>
  );
}
