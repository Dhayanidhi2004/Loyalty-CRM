import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, deviceId, getToken, setToken, LOGOUT_MSG } from './api';

// Logged out after this long without any mouse / keyboard / touch activity (keep in step with the server).
const IDLE_MS = 60 * 60 * 1000;
const PING_MS = 5 * 60 * 1000; // while the person is active, tell the server every 5 minutes
const ACTIVE_KEY = 'crm_last_active'; // shared by all tabs of this browser
const lastActive = () => Number(localStorage.getItem(ACTIVE_KEY)) || 0;
const markActive = () => localStorage.setItem(ACTIVE_KEY, String(Date.now()));

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [modules, setModules] = useState(null);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState(null);
  const timer = useRef();

  const notify = useCallback((message, type = 'ok') => {
    clearTimeout(timer.current);
    setToast({ message, type });
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const loadSession = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setReady(true);
      return;
    }
    try {
      const [{ user: u }, mods] = await Promise.all([api('/auth/me'), api('/modules')]);
      setUser(u);
      setModules(mods);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  async function login(email, password) {
    const { token, user: u } = await api('/auth/login', { method: 'POST', body: { email, password, deviceId: deviceId() } });
    setToken(token);
    markActive();
    sessionStorage.removeItem(LOGOUT_MSG);
    // load module definitions before marking the user logged in, so no page renders without them
    setModules(await api('/modules'));
    setUser(u);
    return u;
  }

  // Frees the account on the server first (so it can be logged in again), then clears this browser.
  const logout = useCallback((message) => {
    if (getToken()) api('/auth/logout', { method: 'POST', quiet: true }).catch(() => {});
    if (message) sessionStorage.setItem(LOGOUT_MSG, message);
    setToken(null);
    setUser(null);
  }, []);

  // Idle logout + keep-alive: only real use (mouse, keys, touch, scroll) counts as activity.
  useEffect(() => {
    if (!user) return undefined;
    if (!lastActive()) markActive();
    let wrote = 0;
    const onActivity = () => { const n = Date.now(); if (n - wrote > 5000) { wrote = n; markActive(); } };
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel', 'click'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true, capture: true }));
    const check = () => {
      if (Date.now() - lastActive() > IDLE_MS) logout('You were logged out after 1 hour of inactivity. Please log in again.');
    };
    const ping = () => { if (Date.now() - lastActive() < PING_MS + 30000) api('/auth/ping', { method: 'POST' }).catch(() => {}); };
    const t1 = setInterval(check, 30000);
    const t2 = setInterval(ping, PING_MS);
    const onVisible = () => { if (!document.hidden) check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    // logged out in another tab of this browser
    const onStorage = (e) => { if (e.key === 'crm_token' && !e.newValue) setUser(null); };
    window.addEventListener('storage', onStorage);
    check();
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity, { capture: true }));
      clearInterval(t1); clearInterval(t2);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
      window.removeEventListener('storage', onStorage);
    };
  }, [user, logout]);

  return (
    <Ctx.Provider value={{ user, setUser, modules, ready, login, logout, notify }}>
      {children}
      {toast && <div className={`toast ${toast.type === 'error' ? 'err' : 'ok'}`}>{toast.message}</div>}
    </Ctx.Provider>
  );
}
