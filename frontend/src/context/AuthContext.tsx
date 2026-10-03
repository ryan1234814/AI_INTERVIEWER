import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AuthUser,
  UNAUTHORIZED_EVENT,
  clearToken,
  getMe,
  getToken,
  login as apiLogin,
  logout as apiLogout,
  signup as apiSignup,
} from '../services/api';

export interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  /** True while the stored session is being restored on first paint. */
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  signup: (name: string, email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => getToken());
  // Only show the loading state when there is actually a session to verify.
  const [loading, setLoading] = useState<boolean>(() => Boolean(getToken()));

  // Restore the session: a token in localStorage proves nothing on its own, so
  // /auth/me decides whether the user is really still signed in.
  useEffect(() => {
    if (!getToken()) return;

    let cancelled = false;
    getMe()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        if (cancelled) return;
        // Expired, tampered or orphaned token — start clean.
        clearToken();
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Any non-auth request that comes back 401 means this token is no longer
  // trusted: drop it so ProtectedRoute redirects to /login.
  useEffect(() => {
    const onUnauthorized = () => {
      apiLogout();
      setToken(null);
      setUser(null);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiLogin(email, password);
    setToken(response.access_token);
    setUser(response.user);
    setLoading(false);
    return response.user;
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const response = await apiSignup(name, email, password);
    setToken(response.access_token);
    setUser(response.user);
    setLoading(false);
    return response.user;
  }, []);

  const logout = useCallback(() => {
    apiLogout();
    setToken(null);
    setUser(null);
    setLoading(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(user),
      login,
      signup,
      logout,
    }),
    [user, token, loading, login, signup, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return context;
};
