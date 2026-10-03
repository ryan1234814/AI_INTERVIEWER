import axios from 'axios';

// Production uses the absolute Render backend URL (VITE_API_URL); local dev
// falls back to the relative path so the Vite proxy keeps working unchanged.
const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api/v1`
  : '/api/v1';

const api = axios.create({
  baseURL: API_BASE,
});

// ─── Auth plumbing ───────────────────────────────────────────────────────────
// The JWT lives in localStorage under "token" so it survives reloads; every
// request attaches it, and a 401 anywhere means the session is gone.
export const TOKEN_STORAGE_KEY = 'token';

// Dispatched when the API rejects our token. AuthContext listens and sends the
// user to /login through the router — a client-side redirect, rather than a
// full page reload, so an expired token during a live interview cannot wipe the
// in-progress UI as well as it lands.
export const UNAUTHORIZED_EVENT = 'auth:unauthorized';

export const getToken = (): string | null => localStorage.getItem(TOKEN_STORAGE_KEY);

export const setToken = (token: string): void => {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
};

export const clearToken = (): void => {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
};

// Routes that legitimately answer 401 (a wrong password is a form error, not a
// session expiry), plus /auth/me, which the session-restore probe handles itself
export const isAuthEndpoint = (url: string): boolean => url.includes('/auth/');

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const url = error.config?.url ?? '';
      if (!isAuthEndpoint(url)) {
        clearToken();
        window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      }
    }
    return Promise.reject(error);
  }
);

/** Backend `detail` (string) or FastAPI validation list -> a readable message. */
export const getApiError = (error: unknown, fallback = 'Something went wrong'): string => {
  if (!axios.isAxiosError(error)) return fallback;

  const detail = error.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    const msg = typeof first?.msg === 'string' ? first.msg : fallback;
    const loc = Array.isArray(first?.loc) ? first.loc.filter((p: unknown) => p !== 'body') : [];
    return loc.length ? `${loc.join('.')}: ${msg}` : msg;
  }
  // ERR_NETWORK is genuinely ambiguous from JavaScript: a rejected CORS preflight
  // and an unreachable server look identical to the page. Say both — blaming only
  // the server sent someone to the Render dashboard while the API was healthy and
  // BACKEND_CORS_ORIGINS was simply unset.
  if (error.code === 'ERR_NETWORK') {
    return 'Cannot reach the server. If it is online, this browser origin is probably not allowed by CORS (set BACKEND_CORS_ORIGINS on the backend).';
  }
  return fallback;
};

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  created_at: string | null;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export const signup = async (
  name: string,
  email: string,
  password: string
): Promise<AuthResponse> => {
  const response = await api.post('/auth/signup', { name, email, password });
  setToken(response.data.access_token);
  return response.data;
};

export const login = async (email: string, password: string): Promise<AuthResponse> => {
  const response = await api.post('/auth/login', { email, password });
  setToken(response.data.access_token);
  return response.data;
};

export const getMe = async (): Promise<AuthUser> => {
  const response = await api.get('/auth/me');
  return response.data;
};

/**
 * Local sign-out: the API is stateless (no server-side session to revoke), so
 * dropping the token is the logout. Kept async-free for the same reason.
 */
export const logout = (): void => {
  clearToken();
};

export interface SetupInterviewResponse {
  interview_id: number;
  job_id: number;
  candidate_id: number;
  candidate_name: string;
  extracted_skills: string[];
  experience_summary: string;
  questions: string[];
  status: string;
}

export interface SubmitResponseResult {
  response_id: number;
  evaluation: any;
  next_question: string;
  current_index: number;
  total_questions: number;
  status: string;
  is_repeat?: boolean;
}

export interface InterviewDetail {
  id: number;
  status: string;
  total_questions: number;
  current_question_index: number;
  job: {
    id: number;
    title: string;
    description: string;
    requirements: string[];
  } | null;
  candidate: {
    id: number;
    name: string;
    email: string;
    extracted_skills: string[];
    experience_summary: string;
  } | null;
  responses: {
    id: number;
    question_text: string;
    candidate_response: string;
    evaluation_score: number | null;
    feedback: string | null;
    behavioral_analysis: any | null;
    filler_count: number | null;
    filler_rate: number | null;
    wpm: number | null;
    sentiment_label: string | null;
    clarity_score: number | null;
    confidence_score: number | null;
  }[];
  evaluation: {
    overall_score: number;
    technical_score: number;
    communication_score: number;
    relevance_score: number;
    strengths: string[];
    weaknesses: string[];
    summary: string;
    behavioral_summary: any | null;
    avg_filler_rate: number | null;
    avg_wpm: number | null;
    avg_clarity: number | null;
    avg_confidence: number | null;
    avg_star: number | null;
  } | null;
  proctor_summary: {
    total_events: number;
    counts: Record<string, number>;
    warnings: number;
    device_detections: number;
    distracted_events: number;
    avg_focus: number | null;
    focus_pct: number;
    integrity: string;
  } | null;
}

export interface InterviewListItem {
  id: number;
  status: string;
  total_questions: number;
  current_question_index: number;
  started_at: string | null;
  job_title: string;
  candidate_name: string;
}

export const setupInterview = async (formData: FormData): Promise<SetupInterviewResponse> => {
  const response = await api.post('/interviews/setup', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const getInterview = async (interviewId: number): Promise<InterviewDetail> => {
  const response = await api.get(`/interviews/${interviewId}`);
  return response.data;
};

export const listInterviews = async (): Promise<InterviewListItem[]> => {
  const response = await api.get('/interviews/');
  return response.data.interviews;
};

export const submitResponse = async (
  interviewId: number,
  questionText: string,
  candidateResponse: string
): Promise<SubmitResponseResult> => {
  const formData = new FormData();
  formData.append('question_text', questionText);
  formData.append('candidate_response', candidateResponse);
  const response = await api.post(`/interviews/${interviewId}/respond`, formData);
  return response.data;
};

export const completeInterview = async (interviewId: number) => {
  const response = await api.post(`/interviews/${interviewId}/complete`);
  return response.data;
};

export const downloadReport = async (interviewId: number, candidateName: string): Promise<void> => {
  try {
    const response = await api.get(`/interviews/${interviewId}/report`, {
      responseType: 'blob',
    });

    const blob = new Blob([response.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Interview_Report_${candidateName.replace(/\s+/g, '_')}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to download report:', error);
    throw error;
  }
};

export interface ProctorEventPayload {
  event_type: string;
  detail?: string;
  focus_score?: number;
}

export interface ProctorEventResult {
  id: number;
  event_type: string;
  is_warning: boolean;
  warnings: number;
  warnings_remaining: number;
  terminated: boolean;
  reason: string | null;
}

export const reportProctorEvent = async (
  interviewId: number,
  payload: ProctorEventPayload,
): Promise<ProctorEventResult | null> => {
  try {
    const res = await api.post(`/interviews/${interviewId}/proctor-event`, payload);
    return res.data as ProctorEventResult;
  } catch (error: any) {
    // 410 = interview already terminated — surface it so the UI can close.
    if (error?.response?.status === 410) {
      return { id: 0, event_type: payload.event_type, is_warning: true, warnings: 7, warnings_remaining: 0, terminated: true, reason: error?.response?.data?.detail || 'Interview terminated after repeated proctoring warnings.' };
    }
    // Proctor logging is best-effort — never break the interview over it.
    console.warn('Failed to log proctor event:', error);
    return null;
  }
};

export const getProctorSummary = async (interviewId: number) => {
  const response = await api.get(`/interviews/${interviewId}/proctor-summary`);
  return response.data;
};

export default api;
