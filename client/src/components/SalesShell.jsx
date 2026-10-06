import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowLeft, Building2, Calendar, FileText, Mail, MapPin, Phone, Radio, Tag, UserCheck } from 'lucide-react';
import Shell from './Shell';
import Modal from './Modal';
import { StatusBadge } from './Bits';
import { RecordFormModal, useAssignable } from './RecordModals';
import { useApp } from '../AppContext';
import { api, fileUrl } from '../api';
import { initials, fmtDate } from '../format';
import { LEAD_STAGES, canCreate, canDelete, canEditAll, canEditRecord, homeFor, levelOf } from '../access';

export const SALES_HOME = '/SaleteamDasboard/Dasboard';

// Black frame + "Enterprise CRM / <page>" bar with the employee ID, as on the sales team and Lead Filler screens.
export default function SalesShell({ subtitle, children, back = true }) {
  const { user } = useApp();
  return (
    <Shell tinted variant="dark">
      <div className="dash-bar">
        <div className="dash-bar-inner">
          <div className="dash-id">
            <span className="sales-logo"><Activity size={26} strokeWidth={2.4} /></span>
            <div>
              <h2>Enterprise CRM</h2>
              <p>{subtitle}</p>
            </div>
          </div>
          <div className="sales-user">
            <div>
              <b>{user.name}</b>
              <span>ID: {user.emp_code || '—'}</span>
            </div>
            <div className="avatar-a">{user.photo ? <img src={fileUrl(user.photo)} alt="" /> : initials(user.name).slice(0, 1)}</div>
          </div>
        </div>
      </div>
      <div className="sales-body">
        {back && (
          <Link to={typeof back === 'string' ? back : homeFor(user)} className="back-dash"><ArrowLeft size={18} /> Back to Dashboard</Link>
        )}
        {children}
      </div>
    </Shell>
  );
}

export const PRIORITY_TONE = { Hot: 'hot', High: 'high', Warm: 'warm', Low: 'low' };

// "View Full Details" on a lead: all details, plus assign (Sales Head), change stage, edit, create quotation.
export function LeadDetailModal({ lead, onClose, onChanged, onDelete }) {
  const { user, notify, modules } = useApp();
  const level = levelOf(user, 'leads');
  const mayAssign = canEditAll(level);
  const mayEdit = canEditRecord(level, lead, user);
  const people = useAssignable(mayAssign);
  const [stage, setStage] = useState(lead.status);
  const [assignee, setAssignee] = useState(lead.assignedTo ?? '');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const dirty = stage !== lead.status || String(assignee) !== String(lead.assignedTo ?? '');
  const mayQuote = canCreate(levelOf(user, 'quotations'));
  // Lead Fillers enter enquiries; the sales team moves them through the stages.
  const enterOnly = user.dashboard === 'leads';
  const mayStage = mayEdit && !enterOnly;

  async function save() {
    setBusy(true);
    try {
      const body = { status: stage };
      if (mayAssign) body.assignedTo = assignee === '' ? null : Number(assignee);
      const updated = await api(`/records/leads/${lead.id}`, { method: 'PUT', body });
      notify('Enquiry updated');
      onChanged(updated);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <RecordFormModal moduleKey="leads" mod={modules.leads} record={lead} onClose={() => setEditing(false)}
        only={enterOnly ? (f) => !!f.section : undefined}
        onSaved={(u) => { setEditing(false); onChanged(u); }} />
    );
  }
  if (quoting) {
    return (
      <RecordFormModal
        moduleKey="quotations" mod={modules.quotations}
        record={{ customerName: lead.companyName || lead.customerName, enquiryNo: lead.enqNo, gst: 18 }}
        onClose={() => setQuoting(false)}
        onSaved={async () => {
          setQuoting(false);
          notify('Quotation created — enquiry moved to Quoted');
          try { onChanged(await api(`/records/leads/${lead.id}`)); } catch { onClose(); }
        }}
      />
    );
  }

  const row = (Icon, label, value) => (
    <div className="ld-row"><Icon size={17} /><span>{label}</span><b>{value || '—'}</b></div>
  );

  return (
    <Modal
      wide
      title={lead.companyName || lead.customerName}
      onClose={onClose}
      footer={
        <>
          {onDelete && canDelete(level) && <button className="btn btn-danger" onClick={() => onDelete(lead)}>Delete</button>}
          <span style={{ flex: 1 }} />
          {mayQuote && <button className="btn btn-soft" onClick={() => setQuoting(true)}><FileText size={16} /> Create Quotation</button>}
          {mayEdit && <button className="btn btn-soft" onClick={() => setEditing(true)}>Edit Details</button>}
          {mayStage && <button className="btn btn-green" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>}
        </>
      }
    >
      <div className="ld-top">
        <div>
          <div className="ld-enq">{lead.enqNo}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            <StatusBadge status={lead.status} />
            {lead.priority && <span className={`prio ${PRIORITY_TONE[lead.priority] || ''}`}>{lead.priority}</span>}
            {lead.category && <span className={`cat ${lead.category === 'Service' ? 'svc' : ''}`}>{lead.category}</span>}
          </div>
        </div>
      </div>
      <div className="ld-grid">
        {row(Building2, 'Company', lead.companyName)}
        {row(UserCheck, 'Contact', [lead.customerName, lead.department].filter(Boolean).join(' · '))}
        {row(Phone, 'Phone', [lead.phone, lead.altPhone].filter(Boolean).join(' / '))}
        {row(Mail, 'Email', [lead.email, lead.altEmail].filter(Boolean).join(' / '))}
        {row(MapPin, 'Address', [lead.address, lead.city, lead.state, lead.postalCode, lead.country].filter(Boolean).join(', '))}
        {row(Calendar, 'Received', fmtDate(lead.createdAt))}
        {row(Radio, 'Lead Medium', lead.source)}
        {row(Tag, 'Lead Condition', lead.condition)}
        {row(UserCheck, 'Sales Head', lead.salesHeadName)}
        {row(UserCheck, 'Entered By', lead.createdByName)}
        {row(Calendar, 'Next Follow-up', fmtDate(lead.followUpDate))}
        {lead.emailLeadId && row(Mail, 'From Email Leads', 'Yes')}
      </div>
      {(lead.product || lead.requirement || lead.remarks) && (
        <div className="ld-notes">
          {lead.product && <p><b>Interested in:</b> {lead.product}</p>}
          {lead.requirement && <p><b>Description:</b> {lead.requirement}</p>}
          {lead.remarks && <p><b>Remarks:</b> {lead.remarks}</p>}
        </div>
      )}
      <div className="ld-actions">
        <div className="fld">
          <label htmlFor="ld-assign">Assigned To</label>
          {mayAssign ? (
            <select id="ld-assign" className="sel" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Not assigned</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code || p.role})</option>)}
            </select>
          ) : (
            <input id="ld-assign" className="inp" readOnly value={lead.assignedToName || 'Not assigned yet'} />
          )}
        </div>
        <div className="fld">
          <label htmlFor="ld-stage">Stage</label>
          <select id="ld-stage" className="sel" value={stage} disabled={!mayStage} onChange={(e) => setStage(e.target.value)}>
            {LEAD_STAGES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>
      {mayAssign && stage === 'New Lead' && assignee !== '' && <p className="hint" style={{ color: '#6b7280', fontSize: 13, margin: '8px 0 0' }}>Assigning moves the enquiry to “Assigned”.</p>}
    </Modal>
  );
}
