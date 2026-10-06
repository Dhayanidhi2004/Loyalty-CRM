import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, getToken, setToken } from './api';

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
    const { token, user: u } = await api('/auth/login', { method: 'POST', body: { email, password } });
    setToken(token);
    // load module definitions before marking the user logged in, so no page renders without them
    setModules(await api('/modules'));
    setUser(u);
    return u;
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return (
    <Ctx.Provider value={{ user, setUser, modules, ready, login, logout, notify }}>
      {children}
      {toast && <div className={`toast ${toast.type === 'error' ? 'err' : 'ok'}`}>{toast.message}</div>}
    </Ctx.Provider>
  );
}
