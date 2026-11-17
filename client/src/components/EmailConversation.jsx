import { useCallback, useEffect, useRef, useState } from 'react';
import { Mail, RefreshCw, Send } from 'lucide-react';
import Modal from './Modal';
import { api } from '../api';
import { useApp } from '../AppContext';
import { BRAND } from '../config';

const when = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

// Ready-made openings; clicking one puts it where the cursor is.
const TEMPLATES = [
  ['Acknowledge', 'Thank you for your enquiry. We have received your requirement and our team will send you our best offer shortly.'],
  ['Ask for details', 'Thank you for your enquiry. To prepare an accurate quotation, could you please share the quantity, preferred make / model, required delivery date and a contact number?'],
  ['Quotation follows', 'Please find our offer for your requirement below. Kindly let us know if you need any clarification or changes.'],
  ['Schedule a call', 'Thank you for reaching out. Please let us know a convenient time for our engineer to call you and discuss the requirement.'],
  ['Service visit', 'We have noted your service request. Our service engineer will contact you to schedule a visit at the earliest.'],
];

function firstName(name, email) {
  const n = String(name || '').trim();
  if (n) return n.split(/\s+/)[0];
  return email ? 'Sir / Madam' : '';
}

// Whole email conversation of an email lead, with a reply box. The reply goes out from the Gmail inbox the
// enquiry came to, in the same thread, so the customer sees an ordinary reply.
export default function EmailConversation({ emailLeadId, onClose, onSent }) {
  const { user, notify } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [quote, setQuote] = useState(true);
  const [busy, setBusy] = useState('');
  const box = useRef(null);
  const end = useRef(null);
  const blank = useRef('');

  const load = useCallback(async (resetDraft) => {
    setError('');
    try {
      const d = await api(`/email-replies/${emailLeadId}`);
      setData(d);
      if (resetDraft) {
        setTo(d.draft.to);
        setSubject(d.draft.subject);
        const last = [...d.messages].reverse().find((m) => !m.mine);
        const text = `Dear ${firstName(last?.fromName || d.emailLead.fromName, d.draft.to)},\n\n\n\nRegards,\n${user.name}\n${BRAND.legalName}\n${BRAND.phone}`;
        blank.current = text;
        setBody(text);
      }
    } catch (e) {
      setError(e.message);
      setData((x) => x || { messages: [] });
    }
  }, [emailLeadId, user.name]);

  useEffect(() => { load(true); }, [load]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [data?.messages?.length]);

  function insert(text) {
    const el = box.current;
    if (body === blank.current) {
      // the blank letter: the template goes between "Dear …," and "Regards"
      const at = body.indexOf('\n\n\n\n');
      setBody(`${body.slice(0, at)}\n\n${text}\n\n${body.slice(at + 4)}`);
      return;
    }
    const pos = el ? el.selectionStart : body.length;
    setBody(`${body.slice(0, pos)}${text}${body.slice(pos)}`);
  }

  async function send() {
    if (body.trim() === blank.current.trim()) return notify('Write your reply first', 'error');
    setBusy('send');
    try {
      const r = await api(`/email-replies/${emailLeadId}`, { method: 'POST', body: { to, cc, subject, body, quote } });
      notify(r.message);
      onSent && onSent();
      await load(true);
    } catch (e) {
      notify(e.message, 'error');
      if (/Connect Gmail/i.test(e.message)) setData((d) => ({ ...d, canSend: false }));
    } finally {
      setBusy('');
    }
  }

  async function reconnect() {
    setBusy('connect');
    try {
      const { url } = await api('/gmail/auth-url');
      window.location.assign(url);
    } catch (e) {
      notify(e.message, 'error');
      setBusy('');
    }
  }

  const lead = data?.emailLead;
  const blocked = data && (!data.connected || !data.canSend);
  return (
    <Modal
      wide
      title={lead ? lead.subject || 'Email conversation' : 'Email conversation'}
      onClose={busy === 'send' ? () => {} : onClose}
      footer={data && !blocked && (
        <>
          <label className="ec-quote"><input type="checkbox" checked={quote} onChange={(e) => setQuote(e.target.checked)} /> Include their last message below my reply</label>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-soft" onClick={onClose} disabled={busy === 'send'}>Close</button>
          <button type="button" className="btn btn-green" onClick={send} disabled={!!busy || !to.trim()}><Send size={16} /> {busy === 'send' ? 'Sending…' : 'Send Reply'}</button>
        </>
      )}
    >
      {!data ? <div className="center-msg"><div className="spinner" />Loading conversation…</div> : (
        <>
          {error && <div className="form-error">{error}</div>}
          {lead && (
            <div className="ec-meta">
              <span><Mail size={15} /> {lead.fromName ? `${lead.fromName} · ` : ''}{lead.fromEmail}</span>
              {lead.enqNo && <span className="ec-enq">Enquiry {lead.enqNo}</span>}
              {data.inbox && <span className="muted">Inbox: {data.inbox}</span>}
              <button type="button" className="el-link" onClick={() => load(false)}><RefreshCw size={13} /> Refresh</button>
            </div>
          )}
          {data.connected && !data.live && <p className="ec-note">Gmail could not be reached just now, so this shows the copy saved in the CRM.</p>}
          <div className="ec-thread">
            {data.messages.length === 0 && <div className="ec-empty">No messages.</div>}
            {data.messages.map((m) => (
              <div key={m.id || m.date} className={`ec-msg${m.mine ? ' mine' : ''}`}>
                <div className="ec-head">
                  <b>{m.mine ? (m.sentBy === user.name ? 'You' : m.sentBy ? `${m.sentBy} (your team)` : 'Your team') : m.fromName || m.fromEmail}</b>
                  <span>{when(m.date)}</span>
                </div>
                {!m.mine && m.fromName && <div className="ec-sub">{m.fromEmail}</div>}
                {m.mine && m.to && <div className="ec-sub">To: {m.to}{m.cc ? ` · Cc: ${m.cc}` : ''}</div>}
                <div className="ec-body">{m.body}</div>
              </div>
            ))}
            <div ref={end} />
          </div>

          {blocked ? (
            <div className="ec-blocked">
              {!data.connected ? (
                <>The Gmail inbox this enquiry came to is not connected any more, so replies can't be sent from the CRM.</>
              ) : data.isInboxOwner ? (
                <>
                  Your Gmail was connected for <b>reading only</b>. Connect it again and allow <b>“Send email on your behalf”</b> to reply from here.
                  <div><button type="button" className="btn btn-primary" onClick={reconnect} disabled={!!busy}><Mail size={16} /> {busy === 'connect' ? 'Opening Google…' : 'Reconnect Gmail'}</button></div>
                </>
              ) : (
                <>The inbox <b>{data.inbox}</b> was connected for reading only. Ask {data.inboxOwner || 'its owner'} to click Connect Gmail again on the Email Leads page and allow sending.</>
              )}
            </div>
          ) : (
            <div className="ec-compose">
              <div className="ec-row">
                <label htmlFor="ec-to">To</label>
                <input id="ec-to" className="inp" value={to} onChange={(e) => setTo(e.target.value)} />
                {!showCc && <button type="button" className="el-link" onClick={() => setShowCc(true)}>Cc</button>}
              </div>
              {showCc && (
                <div className="ec-row"><label htmlFor="ec-cc">Cc</label><input id="ec-cc" className="inp" placeholder="name@company.com, …" value={cc} onChange={(e) => setCc(e.target.value)} /></div>
              )}
              <div className="ec-row"><label htmlFor="ec-subj">Subject</label><input id="ec-subj" className="inp" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
              <div className="ec-tpl">
                {TEMPLATES.map(([label, text]) => <button key={label} type="button" onClick={() => insert(text)}>{label}</button>)}
              </div>
              <textarea ref={box} className="inp ec-text" rows={9} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Reply" />
              <p className="ec-from">Sent from <b>{data.inbox}</b> as a reply in the same Gmail conversation.</p>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
