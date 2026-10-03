import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * Gate for authenticated routes.
 *
 * `loading` is checked first: on a hard refresh the stored token is still being
 * verified against /auth/me, and redirecting during that window would bounce a
 * legitimately signed-in user out to the login page.
 */
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        className="flex items-center justify-center gap-3 py-24"
        style={{ color: 'var(--foreground-tertiary)' }}
      >
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading your session…</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
