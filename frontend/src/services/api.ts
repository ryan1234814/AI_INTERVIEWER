import axios from 'axios';

const API_BASE = '/api/v1';

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
  }[];
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

export default api;
