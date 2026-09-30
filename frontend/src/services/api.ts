import axios from 'axios';

// Production uses the absolute Render backend URL (VITE_API_URL); local dev
// falls back to the relative path so the Vite proxy keeps working unchanged.
const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api/v1`
  : '/api/v1';

const api = axios.create({
  baseURL: API_BASE,
});

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

export const reportProctorEvent = async (
  interviewId: number,
  payload: ProctorEventPayload,
): Promise<void> => {
  try {
    await api.post(`/interviews/${interviewId}/proctor-event`, payload);
  } catch (error) {
    // Proctor logging is best-effort — never break the interview over it.
    console.warn('Failed to log proctor event:', error);
  }
};

export const getProctorSummary = async (interviewId: number) => {
  const response = await api.get(`/interviews/${interviewId}/proctor-summary`);
  return response.data;
};

export default api;
