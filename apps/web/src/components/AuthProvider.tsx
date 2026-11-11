import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MeResponse } from '@meeting-assistant/shared';
import { AuthContext, type AuthStatus } from '../hooks/useAuth';
import { AuthError, fetchMe, logout } from '../lib/auth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchMe();
      setMe(next);
      setStatus('authenticated');
      setError(null);
    } catch (err) {
      setMe(null);
      setStatus('unauthenticated');
      if (err instanceof AuthError && err.status !== 401) {
        setError(err.message);
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    await logout();
    setMe(null);
    setStatus('unauthenticated');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ status, me, error, refresh, signOut }),
    [status, me, error, refresh, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
