// Tiny fetch wrapper. Set VITE_API_URL when the API is on a different domain.
const BASE = import.meta.env.VITE_API_URL || '';

export const getToken = () => localStorage.getItem('crm_token');
export const setToken = (t) => (t ? localStorage.setItem('crm_token', t) : localStorage.removeItem('crm_token'));

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
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
  if (res.status === 401 && token) {
    setToken(null);
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
