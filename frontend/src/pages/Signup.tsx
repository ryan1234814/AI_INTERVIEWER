import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Loader2, Mail, User, UserPlus, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getApiError } from '../services/api';
import {
  FieldErrors,
  MIN_PASSWORD_LENGTH,
  SignupFields,
  validateSignup,
} from '../utils/authValidation';

const fieldErrorStyle: React.CSSProperties = { color: 'var(--danger)' };

const Signup: React.FC = () => {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [fields, setFields] = useState<SignupFields>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<SignupFields>>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (key: keyof SignupFields) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFields((prev) => ({ ...prev, [key]: event.target.value }));
    // Clear just this field's message so the form stops nagging while typing.
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const errors = validateSignup(fields);
    setFieldErrors(errors);
    setFormError('');
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      await signup(fields.name.trim(), fields.email.trim(), fields.password);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setFormError(getApiError(error, 'Unable to create your account. Please try again.'));
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
          <UserPlus className="w-5 h-5" style={{ color: 'var(--accent-text)' }} />
        </div>

        <span className="label-eyebrow">Get started</span>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">Create your account</h1>
        <p className="text-sm mt-2" style={{ color: 'var(--foreground-secondary)' }}>
          Every interview you run is private to your account.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <div>
            <label htmlFor="name" className="label-eyebrow">
              Name
            </label>
            <div className="relative mt-2">
              <User
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: 'var(--foreground-tertiary)' }}
              />
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={fields.name}
                onChange={update('name')}
                placeholder="Ryan George"
                className="input pl-10"
              />
            </div>
            {fieldErrors.name && (
              <p className="text-xs mt-1.5" style={fieldErrorStyle}>
                {fieldErrors.name}
              </p>
            )}
          </div>

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
                value={fields.email}
                onChange={update('email')}
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
            <div className="relative mt-2">
              <Lock
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: 'var(--foreground-tertiary)' }}
              />
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={fields.password}
                onChange={update('password')}
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                className="input pl-10"
              />
            </div>
            {fieldErrors.password && (
              <p className="text-xs mt-1.5" style={fieldErrorStyle}>
                {fieldErrors.password}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="label-eyebrow">
              Confirm password
            </label>
            <div className="relative mt-2">
              <Lock
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: 'var(--foreground-tertiary)' }}
              />
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={fields.confirmPassword}
                onChange={update('confirmPassword')}
                placeholder="Re-enter your password"
                className="input pl-10"
              />
            </div>
            {fieldErrors.confirmPassword && (
              <p className="text-xs mt-1.5" style={fieldErrorStyle}>
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>

          {formError && (
            <div
              className="rounded-lg px-4 py-3 text-sm"
              role="alert"
              style={{
                background: 'var(--danger-subtle)',
                border: '1px solid var(--danger-border)',
                color: 'var(--danger)',
              }}
            >
              {formError}
            </div>
          )}

          <button type="submit" disabled={submitting} className="btn btn-primary w-full justify-center">
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating account…
              </>
            ) : (
              <>
                Create account
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between text-sm">
          <span style={{ color: 'var(--foreground-tertiary)' }}>Already have an account?</span>
          <Link
            to="/login"
            className="font-medium hover:opacity-80 transition-opacity"
            style={{ color: 'var(--accent-text)' }}
          >
            Sign in
          </Link>
        </div>
      </div>
    </motion.div>
  );
};

export default Signup;
