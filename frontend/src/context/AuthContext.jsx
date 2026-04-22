import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const API = 'https://codearena.ninja/api';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);      // { id, username, email, ai_debugs_remaining }
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true);      // true while checking stored token on boot

  // On mount: try to restore session from localStorage refresh token 
  useEffect(() => {
    const refresh = localStorage.getItem('refresh_token');
    if (!refresh) { setLoading(false); return; }

    fetch(`${API}/auth/refresh/`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refresh }),
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        setAccessToken(data.access);
        return fetch(`${API}/auth/me/`, {
          headers: { Authorization: `Bearer ${data.access}` }
        });
      })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(userData => { setUser(userData); })
      .catch(() => { localStorage.removeItem('refresh_token'); })
      .finally(() => setLoading(false));
  }, []);

  // authFetch: like fetch() but auto-attaches Bearer token
  const authFetch = useCallback(async (url, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

    let response = await fetch(url, { ...options, headers });

    // If 401 → try refresh once
    if (response.status === 401) {
      const refresh = localStorage.getItem('refresh_token');
      if (refresh) {
        const refreshRes = await fetch(`${API}/auth/refresh/`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ refresh }),
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setAccessToken(data.access);
          if (data.refresh) localStorage.setItem('refresh_token', data.refresh);
          headers['Authorization'] = `Bearer ${data.access}`;
          response = await fetch(url, { ...options, headers });
        } else {
          // Refresh also failed → logged out
          logout();
        }
      }
    }
    return response;
  }, [accessToken]);

  //  Login 
  const login = useCallback(async (username, password) => {
    const res = await fetch(`${API}/auth/login/`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    setAccessToken(data.access);
    setUser(data.user);
    localStorage.setItem('refresh_token', data.refresh);
    return data.user;
  }, []);

  //  Register 
  const register = useCallback(async (username, email, password) => {
    const res = await fetch(`${API}/auth/register/`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');

    setAccessToken(data.access);
    setUser(data.user);
    localStorage.setItem('refresh_token', data.refresh);
    return data.user;
  }, []);

  //  Logout 
  const logout = useCallback(async () => {
    const refresh = localStorage.getItem('refresh_token');
    if (refresh && accessToken) {
      fetch(`${API}/auth/logout/`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body:    JSON.stringify({ refresh }),
      }).catch(() => {});  // fire and forget
    }
    setAccessToken(null);
    setUser(null);
    localStorage.removeItem('refresh_token');
  }, [accessToken]);

  //  Update local quota count after AI review
  const decrementQuota = useCallback(() => {
    setUser(prev => prev ? { ...prev, ai_debugs_remaining: prev.ai_debugs_remaining - 1 } : prev);
  }, []);

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, login, register, logout, authFetch, decrementQuota }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export { API };