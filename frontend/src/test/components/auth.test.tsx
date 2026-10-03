/**
 * ProtectedRoute gate + the axios auth interceptors.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthContextValue } from '../../context/AuthContext';

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../../context/AuthContext';
import ProtectedRoute from '../../components/ProtectedRoute';

const mockUseAuth = vi.mocked(useAuth);

const authState = (overrides: Partial<AuthContextValue> = {}): AuthContextValue => ({
  user: null,
  token: null,
  loading: false,
  isAuthenticated: false,
  login: async () => ({ id: 1, name: 'Test User', email: 'test@test.com', created_at: null }),
  signup: async () => ({ id: 1, name: 'Test User', email: 'test@test.com', created_at: null }),
  logout: vi.fn(),
  ...overrides,
});

const renderGuarded = () =>
  render(
    <MemoryRouter initialEntries={['/private']}>
      <Routes>
        <Route
          path="/private"
          element={
            <ProtectedRoute>
              <div>secret dashboard</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>login screen</div>} />
      </Routes>
    </MemoryRouter>
  );

/** Make the axios adapter fail with an HTTP status, without touching the network. */
const failingAdapter = (status: number, detail: string) => async (config: any) => {
  const error: any = new Error(`Request failed with status ${status}`);
  error.isAxiosError = true;
  error.config = config;
  error.response = { status, data: { detail }, headers: {}, config, statusText: '' };
  throw error;
};

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

describe('ProtectedRoute', () => {
  it('renders children for an authenticated user', () => {
    mockUseAuth.mockReturnValue(authState({ isAuthenticated: true }));
    renderGuarded();
    expect(screen.getByText('secret dashboard')).toBeInTheDocument();
  });

  it('waits instead of redirecting while the stored session is being restored', () => {
    mockUseAuth.mockReturnValue(authState({ loading: true }));
    renderGuarded();
    expect(screen.getByText(/Loading your session/)).toBeInTheDocument();
    expect(screen.queryByText('login screen')).not.toBeInTheDocument();
  });

  it('redirects an anonymous visitor to /login', async () => {
    mockUseAuth.mockReturnValue(authState());
    renderGuarded();
    await waitFor(() => expect(screen.getByText('login screen')).toBeInTheDocument());
  });
});

describe('api auth interceptors', () => {
  // Imported lazily so each case gets the live module instance.
  const importApi = async () => import('../../services/api');

  it('attaches the stored bearer token to every request', async () => {
    const api = await importApi();
    api.setToken('abc123');

    let sentAuthorization: unknown;
    api.default.defaults.adapter = async (config: any) => {
      sentAuthorization = config.headers?.Authorization ?? config.headers?.get?.('Authorization');
      return { data: { interviews: [] }, status: 200, statusText: 'OK', headers: {}, config };
    };

    await api.default.get('/interviews/');
    expect(sentAuthorization).toBe('Bearer abc123');
  });

  it('clears the token and announces 401s from user-scoped endpoints', async () => {
    const api = await importApi();
    api.setToken('expired-token');

    const listener = vi.fn();
    window.addEventListener(api.UNAUTHORIZED_EVENT, listener);

    api.default.defaults.adapter = failingAdapter(401, 'Not authenticated');
    await expect(api.default.get('/interviews/')).rejects.toBeTruthy();

    await waitFor(() => expect(listener).toHaveBeenCalled());
    expect(api.getToken()).toBeNull();

    window.removeEventListener(api.UNAUTHORIZED_EVENT, listener);
  });

  it('leaves auth-endpoint 401s to the form so the user sees the reason', async () => {
    const api = await importApi();
    api.setToken('still-valid');

    const listener = vi.fn();
    window.addEventListener(api.UNAUTHORIZED_EVENT, listener);

    api.default.defaults.adapter = failingAdapter(401, 'Incorrect email or password');
    await expect(api.default.post('/auth/login', {})).rejects.toBeTruthy();

    // A wrong password must not sign the user out of a session that works.
    expect(listener).not.toHaveBeenCalled();
    expect(api.getToken()).toBe('still-valid');
    expect(api.getApiError(await api.default.post('/auth/login', {}).catch((e) => e))).toBe(
      'Incorrect email or password'
    );

    window.removeEventListener(api.UNAUTHORIZED_EVENT, listener);
  });

  it('surfaces backend validation lists as readable messages', async () => {
    const api = await importApi();
    api.default.defaults.adapter = async (config: any) => {
      const error: any = new Error('validation');
      error.isAxiosError = true;
      error.config = config;
      error.response = {
        status: 422,
        data: { detail: [{ loc: ['body', 'password'], msg: 'String too short', type: 'value_error' }] },
        headers: {},
        config,
        statusText: '',
      };
      throw error;
    };

    const caught = await api.default.post('/auth/signup', {}).catch((e) => e);
    expect(api.getApiError(caught)).toBe('password: String too short');
  });
});
