// Tiny fetch wrapper. Set VITE_API_URL when the API is on a different domain.
const BASE = import.meta.env.VITE_API_URL || '';

export const getToken = () => localStorage.getItem('crm_token');
export const setToken = (t) => (t ? localStorage.setItem('crm_token', t) : localStorage.removeItem('crm_token'));

// Random id kept in this browser: lets the same browser log in again while its own session is still open.
export function deviceId() {
  let id = localStorage.getItem('crm_device');
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`);
    localStorage.setItem('crm_device', id);
  }
  return id;
}
// Why the person was sent back to the login page (shown once there).
export const LOGOUT_MSG = 'crm_logout_msg';

// background: true = automatic polling, which must not count as the person being active.
// quiet: true = don't redirect to the login page on 401 (used by logout itself).
export async function api(path, { method = 'GET', body, form, background = false, quiet = false } = {}) {
  const headers = {};
  if (background) headers['X-Background'] = '1';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const DOWN = "Can't reach the CRM server. Make sure the API is running (check the terminal for errors).";
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers,
      body: form || (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new Error(DOWN);
  }
  // 502/503/504 from the dev proxy or a host = the API process isn't answering
  if ([502, 503, 504].includes(res.status)) throw new Error(DOWN);
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (res.status === 401 && token && !quiet && path !== '/auth/login') {
    setToken(null);
    if (data?.message) sessionStorage.setItem(LOGOUT_MSG, data.message);
    if (!location.pathname.startsWith('/login')) location.href = '/login';
  }
  if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
  return data;
}

export async function uploadFile(file, folder) {
  const form = new FormData();
  form.append('folder', folder || 'misc');
  form.append('file', file);
  return api('/upload', { method: 'POST', form });
}

// Turns "/uploads/x.png" into a full URL when the API lives elsewhere.
export const fileUrl = (u) => (!u ? '' : /^https?:/.test(u) ? u : `${BASE}${u}`);
