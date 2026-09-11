import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import api, { setAccessToken, setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

  const logout = useCallback(async () => {
    setUser(null);
    setAccessToken(null);
    try {
      await api.post('/auth/logout');
    } catch {
      // best-effort
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setAccessToken(null);
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.post('/auth/refresh');
        setAccessToken(data.accessToken);
        setUser(data.user);
      } catch {
        setAccessToken(null);
      } finally {
        setInitializing(false);
      }
    })();
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }, []);

  const hasPermission = useCallback((permission) => !!user?.permissions?.includes(permission), [user]);

  const value = useMemo(() => ({ user, initializing, login, logout, hasPermission }), [user, initializing, login, logout, hasPermission]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
