import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { TONES, STATUS_TONE } from '../config';
import { fileUrl } from '../api';
import { initials } from '../format';

export function toneStyle(tone) {
  const t = TONES[tone] || TONES.indigo;
  return { background: t.bg, borderColor: t.border, color: t.text };
}

export function QuickButton({ label, tone, to, onClick, count }) {
  const inner = (
    <>
      {label}
      {count !== undefined && count !== null && <span className="qa-count">{count}</span>}
    </>
  );
  return to ? (
    <Link className="qa-btn" style={toneStyle(tone)} to={to}>{inner}</Link>
  ) : (
    <button type="button" className="qa-btn" style={toneStyle(tone)} onClick={onClick}>{inner}</button>
  );
}

export function StatusBadge({ status }) {
  if (!status) return <span>—</span>;
  return <span className="badge" style={toneStyle(STATUS_TONE[status] || 'indigo')}>{status}</span>;
}

export function Photo({ user, className = 'profile-photo' }) {
  return (
    <div className={className}>
      {user?.photo ? <img src={fileUrl(user.photo)} alt={user.name} /> : initials(user?.name)}
    </div>
  );
}

export function Loading({ text = 'Loading…' }) {
  return (
    <div className="center-msg">
      <div className="spinner" />
      {text}
    </div>
  );
}

// Rounded "‹ Back" button used on every inner page of the original CRM.
// variant: '' (purple gradient) | 'blue' | 'solid'
export function BackPill({ to, variant = '', label = 'Back' }) {
  return (
    <Link to={to} className={`back-pill ${variant}`}>
      <ChevronLeft size={variant === 'solid' ? 22 : 20} strokeWidth={2.4} />
      {label}
    </Link>
  );
}
