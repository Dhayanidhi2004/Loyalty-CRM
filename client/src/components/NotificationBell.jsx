import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../AppContext';

const POLL_MS = 30 * 1000;

// Where a notification opens, per login (server/src/notifications.js `kind`).
const ROUTES = {
  admin: {
    lead: '/admin/records/leads', emailLead: '/admin/emailLeads', quotation: '/admin/records/quotations', quotationRequest: '/admin/records/quotationRequests',
    productRequest: '/admin/records/productRequests', poRequest: '/admin/records/poRequests', inventory: '/admin/adminDasboard?tab=inventory',
  },
  sales: {
    lead: '/SaleteamDasboard/Dasboard', quotation: '/SaleteamDasboard/quotations', productRequest: '/SaleteamDasboard/productRequests',
    poRequest: '/SaleteamDasboard/purchaseOrder', inventory: '/SaleteamDasboard/inventory', quotationRequest: '/SaleteamDasboard/Dasboard', emailLead: '/emailLeads',
  },
  leads: { lead: '/leadfiller/leadEnquiries', emailLead: '/leadfiller/emailLeads' },
  service: { lead: '/ServiceProject/Dashboard', inventory: '/ServiceProject/inventory', emailLead: '/emailLeads' },
  employee: {
    lead: '/employee/records/leads', quotation: '/employee/records/quotations', quotationRequest: '/employee/records/quotationRequests',
    productRequest: '/employee/records/productRequests', poRequest: '/employee/records/poRequests', inventory: '/employee/records/inventory',
    emailLead: '/emailLeads',
  },
};

const ago = (v) => {
  const s = Math.max(0, (Date.now() - new Date(v).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

// Bell in the header: red number = unread notifications. Click to see them; click one to open where it points.
export default function NotificationBell() {
  const { user } = useApp();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  const refreshCount = useCallback(() => {
    if (document.hidden) return;
    api('/notifications/count').then((r) => setUnread(r.unread)).catch(() => {});
  }, []);
  const loadList = useCallback(() => api('/notifications?limit=30').then((r) => { setItems(r.items); setUnread(r.unread); }).catch(() => setItems([])), []);

  useEffect(() => {
    refreshCount();
    const t = setInterval(refreshCount, POLL_MS);
    const onFocus = () => refreshCount();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return undefined;
    loadList();
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, loadList]);

  async function openItem(n) {
    setOpen(false);
    if (!n.read) {
      setUnread((u) => Math.max(0, u - 1));
      api(`/notifications/${n.id}/read`, { method: 'POST' }).then((r) => setUnread(r.unread)).catch(() => {});
    }
    const dash = user.role === 'admin' ? 'admin' : user.dashboard;
    const to = ROUTES[dash]?.[n.kind];
    if (to) navigate(to);
  }

  async function readAll() {
    try {
      await api('/notifications/read-all', { method: 'POST' });
      setUnread(0);
      setItems((l) => (l || []).map((n) => ({ ...n, read: true })));
    } catch { /* ignore */ }
  }

  const label = unread > 99 ? '99+' : String(unread);
  return (
    <div className="nb" ref={box}>
      <button type="button" className={`nb-btn${open ? ' on' : ''}`} onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} aria-expanded={open}>
        <Bell size={26} strokeWidth={2.2} />
        {unread > 0 && <span className="nb-count">{label}</span>}
      </button>
      {open && (
        <div className="nb-panel" role="dialog" aria-label="Notifications">
          <div className="nb-head">
            <b>Notifications</b>
            {unread > 0 && <span className="nb-new">{unread} new</span>}
            <span style={{ flex: 1 }} />
            <button type="button" className="nb-all" onClick={readAll} disabled={!unread}><CheckCheck size={16} /> Mark all read</button>
          </div>
          <div className="nb-list">
            {items === null ? <div className="nb-empty">Loading…</div> : items.length === 0 ? (
              <div className="nb-empty">No notifications yet. New enquiries, email leads, quotations and low stock alerts show up here.</div>
            ) : items.map((n) => (
              <button type="button" key={n.id} className={`nb-item${n.read ? '' : ' unread'}`} onClick={() => openItem(n)}>
                <span className={`nb-dot k-${n.kind}`} />
                <span className="nb-text">
                  <span className="nb-title">{n.title}</span>
                  {n.body && <span className="nb-body">{n.body}</span>}
                  <span className="nb-time">{ago(n.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
