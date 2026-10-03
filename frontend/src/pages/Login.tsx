import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Loader2, LogIn, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getApiError } from '../services/api';
import { FieldErrors, validateLogin } from '../utils/authValidation';

type LoginForm = { email: string; password: string };

const fieldErrorStyle: React.CSSProperties = { color: 'var(--danger)' };

const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<LoginForm>>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const errors = validateLogin(email, password);
    setFieldErrors(errors);
    setFormError('');
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setFormError(getApiError(error, 'Unable to sign in. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] as const }}
      className="max-w-md mx-auto"
    >
      <div className="panel rounded-2xl p-8">
        <div
          className="w-11 h-11 rounded-lg flex items-center justify-center mb-5"
          style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)' }}
        >
          <LogIn className="w-5 h-5" style={{ color: 'var(--accent-text)' }} />
        </div>

        <span className="label-eyebrow">Welcome back</span>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">Sign in to your dashboard</h1>
        <p className="text-sm mt-2" style={{ color: 'var(--foreground-secondary)' }}>
          Your interviews, candidates and reports — visible only to you.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="label-eyebrow">
              Email
            </label>
            <div className="relative mt-2">
              <Mail
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: 'var(--foreground-tertiary)' }}
              />
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="input pl-10"
              />
            </div>
            {fieldErrors.email && (
              <p className="text-xs mt-1.5" style={fieldErrorStyle}>
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="label-eyebrow">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input mt-2"
            />
            {fieldErrors.password && (
              <p className="text-xs mt-1.5" style={fieldErrorStyle}>
                {fieldErrors.password}
              </p>
            )}
          </div>

          {formError && (
            <div
              className="rounded-lg px-4 py-3 text-sm"
              role="alert"
              style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger-border)', color: 'var(--danger)' }}
            >
              {formError}
            </div>
          )}

          <button type="submit" disabled={submitting} className="btn btn-primary w-full justify-center">
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Signing in…
              </>
            ) : (
              <>
                Sign in
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between text-sm">
          <span style={{ color: 'var(--foreground-tertiary)' }}>New here?</span>
          <Link to="/signup" className="font-medium hover:opacity-80 transition-opacity" style={{ color: 'var(--accent-text)' }}>
            Create an account
          </Link>
        </div>
      </div>

      <p className="mt-4 flex items-center justify-center gap-2 text-xs" style={{ color: 'var(--foreground-tertiary)' }}>
        <ShieldCheck className="w-3.5 h-3.5" />
        Access tokens are short-lived — sign in again if your session expires.
      </p>
    </motion.div>
  );
};

export default Login;
