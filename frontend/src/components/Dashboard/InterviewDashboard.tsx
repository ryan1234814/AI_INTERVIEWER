import React, { useState, useEffect } from 'react';
import {
  Users,
  CheckCircle,
  Clock3,
  XCircle,
  Download,
  Loader2,
  Search,
  FileText,
} from 'lucide-react';
import { listInterviews, downloadReport } from '../../services/api';

interface Interview {
  id: number;
  status: string;
  total_questions: number;
  current_question_index: number;
  started_at: string | null;
  job_title: string;
  candidate_name: string;
}

type Tone = 'success' | 'warning' | 'accent' | 'neutral';

const TONE: Record<Tone, { bg: string; border: string; color: string }> = {
  success: { bg: 'var(--success-subtle)', border: 'var(--success-border)', color: 'var(--success)' },
  warning: { bg: 'var(--warning-subtle)', border: 'var(--warning-border)', color: 'var(--warning)' },
  accent: { bg: 'var(--accent-subtle)', border: 'var(--accent-border)', color: 'var(--accent-text)' },
  neutral: { bg: 'var(--overlay-light)', border: 'var(--card-border)', color: 'var(--foreground-secondary)' },
};

const InterviewDashboard: React.FC = () => {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  useEffect(() => {
    loadInterviews();
  }, []);

  const loadInterviews = async () => {
    try {
      const data = await listInterviews();
      setInterviews(data);
    } catch (error) {
      console.error('Failed to load interviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (interview: Interview) => {
    if (interview.status !== 'completed') return;

    setDownloadingId(interview.id);
    try {
      await downloadReport(interview.id, interview.candidate_name);
    } catch (error) {
      console.error('Failed to download report:', error);
      alert('Failed to download report. Please try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  // Stats calculation
  const totalInterviews = interviews.length;
  const completedInterviews = interviews.filter(i => i.status === 'completed').length;
  const ongoingInterviews = interviews.filter(i => i.status === 'ongoing').length;

  const completionRate = totalInterviews > 0
    ? Math.round((completedInterviews / totalInterviews) * 100)
    : 0;

  const filteredInterviews = interviews.filter(interview => {
    const matchesSearch =
      interview.candidate_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      interview.job_title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || interview.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const statusTone = (status: string): Tone =>
    status === 'completed' ? 'success' : status === 'ongoing' ? 'accent' : 'warning';

  const getStatusIcon = (status: string) => {
    if (status === 'completed') return <CheckCircle className="w-3.5 h-3.5" />;
    if (status === 'ongoing') return <Clock3 className="w-3.5 h-3.5" />;
    return <XCircle className="w-3.5 h-3.5" />;
  };

  const getProgressPercentage = (interview: Interview) => {
    if (interview.total_questions === 0) return 0;
    return Math.round((interview.current_question_index / interview.total_questions) * 100);
  };

  const metrics = [
    { label: 'Total Interviews', value: totalInterviews },
    { label: 'Completed', value: completedInterviews },
    { label: 'In Progress', value: ongoingInterviews },
    { label: 'Completion Rate', value: `${completionRate}%` },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3" style={{ color: 'var(--foreground-tertiary)' }}>
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading dashboard…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Interview Dashboard</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--foreground-secondary)' }}>
          Track candidate performance and overall stats.
        </p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m, i) => (
          <div key={i} className="panel rounded-xl p-5">
            <p className="label-eyebrow">{m.label}</p>
            <p className="text-3xl font-semibold tabular-nums mt-2">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Search + filter */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--foreground-tertiary)' }} />
          <input
            type="text"
            placeholder="Search candidates or jobs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="input theme-select appearance-none md:w-48"
        >
          <option value="all">All status</option>
          <option value="completed">Completed</option>
          <option value="ongoing">In Progress</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {/* Interview list */}
      <div className="panel rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
          <h3 className="text-sm font-semibold">Recent Interviews</h3>
          <span className="chip tabular-nums">{filteredInterviews.length} total</span>
        </div>

        {filteredInterviews.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--foreground-tertiary)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--foreground-secondary)' }}>No interviews found</p>
            <p className="text-xs mt-1" style={{ color: 'var(--foreground-tertiary)' }}>
              {searchTerm || filterStatus !== 'all'
                ? 'Try adjusting your search or filter criteria'
                : 'Start by creating your first interview'}
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {filteredInterviews.map((interview) => {
              const tone = TONE[statusTone(interview.status)];
              const progress = getProgressPercentage(interview);
              return (
                <div
                  key={interview.id}
                  className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors hover:bg-[var(--overlay-lighter)]"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  {/* Candidate */}
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-semibold shrink-0"
                      style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', color: 'var(--accent-text)' }}
                    >
                      {interview.candidate_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold">{interview.candidate_name}</h4>
                      <p className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>{interview.job_title}</p>
                      <p className="text-[11px] mt-0.5 tabular-nums" style={{ color: 'var(--foreground-tertiary)' }}>
                        #{interview.id} • {interview.started_at
                          ? new Date(interview.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : 'Not started'}
                      </p>
                    </div>
                  </div>

                  {/* Progress + status + action */}
                  <div className="flex items-center gap-5 md:gap-6">
                    <div className="w-36">
                      <div className="flex justify-between text-[11px] mb-1" style={{ color: 'var(--foreground-tertiary)' }}>
                        <span>Progress</span>
                        <span className="tabular-nums">{progress}%</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--overlay-light)' }}>
                        <div className="h-full rounded-full" style={{ width: `${progress}%`, background: 'var(--accent)' }} />
                      </div>
                      <p className="text-[10px] mt-1 tabular-nums" style={{ color: 'var(--foreground-tertiary)' }}>
                        {interview.current_question_index} / {interview.total_questions} questions
                      </p>
                    </div>

                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap"
                      style={{ background: tone.bg, border: `1px solid ${tone.border}`, color: tone.color }}
                    >
                      {getStatusIcon(interview.status)}
                      {interview.status.charAt(0).toUpperCase() + interview.status.slice(1)}
                    </span>

                    <button
                      onClick={() => handleDownload(interview)}
                      disabled={interview.status !== 'completed' || downloadingId === interview.id}
                      className="icon-btn"
                      title={interview.status === 'completed' ? 'Download report' : 'Complete interview to download'}
                    >
                      {downloadingId === interview.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default InterviewDashboard;
