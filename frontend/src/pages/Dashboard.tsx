import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertCircle,
  CheckCircle,
  ClipboardList,
  Clock3,
  Download,
  Loader2,
  Mic,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { InterviewListItem, downloadReport, getApiError, listInterviews } from '../services/api';
import SessionAnalytics from '../components/Dashboard/SessionAnalytics';

type Tone = 'success' | 'warning' | 'accent' | 'neutral';

const TONE: Record<Tone, { bg: string; border: string; color: string }> = {
  success: { bg: 'var(--success-subtle)', border: 'var(--success-border)', color: 'var(--success)' },
  warning: { bg: 'var(--warning-subtle)', border: 'var(--warning-border)', color: 'var(--warning)' },
  accent: { bg: 'var(--accent-subtle)', border: 'var(--accent-border)', color: 'var(--accent-text)' },
  neutral: { bg: 'var(--overlay-light)', border: 'var(--card-border)', color: 'var(--foreground-secondary)' },
};

const statusTone = (status: string): Tone => {
  if (status === 'completed') return 'success';
  if (status === 'ongoing') return 'accent';
  if (status === 'pending') return 'warning';
  return 'neutral';
};

const StatusIcon = ({ status }: { status: string }) => {
  if (status === 'completed') return <CheckCircle className="w-3.5 h-3.5" />;
  if (status === 'ongoing') return <Clock3 className="w-3.5 h-3.5" />;
  if (status === 'pending') return <ClipboardList className="w-3.5 h-3.5" />;
  return <XCircle className="w-3.5 h-3.5" />;
};

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [interviews, setInterviews] = useState<InterviewListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  // Only one analytics panel open at a time — each panel fetches its own
  // series, so keeping them single avoids a stampede of /analytics calls.
  const [analyticsId, setAnalyticsId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    // The endpoint is user-scoped, so this list already only contains rows
    // owned by the signed-in account.
    listInterviews()
      .then((data) => {
        if (!cancelled) setInterviews(data);
      })
      .catch((err) => {
        if (!cancelled) setError(getApiError(err, 'Failed to load your interviews.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleDownload = async (interview: InterviewListItem) => {
    if (interview.status !== 'completed') return;

    setDownloadingId(interview.id);
    setError('');
    try {
      await downloadReport(interview.id, interview.candidate_name);
    } catch (err) {
      setError(getApiError(err, 'Failed to download the report. Please try again.'));
    } finally {
      setDownloadingId(null);
    }
  };

  const total = interviews.length;
  const completed = interviews.filter((i) => i.status === 'completed').length;
  const pending = interviews.filter((i) => i.status === 'pending').length;

  const stats = [
    { label: 'Total Interviews', value: total, icon: ClipboardList },
    { label: 'Completed', value: completed, icon: CheckCircle },
    { label: 'Pending', value: pending, icon: Clock3 },
  ];

  // Handled by Home, which owns the setup + interview flow.
  const startInterview = () => navigate('/', { state: { openSetup: true } });

  const firstName = (user?.name ?? '').trim().split(' ')[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] as const }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <span className="chip">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-text)' }} />
            Private workspace
          </span>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-3">
            Welcome{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--foreground-secondary)' }}>
            {user?.email}
          </p>
        </div>
        <button onClick={startInterview} className="btn btn-primary shrink-0">
          <Mic className="w-4 h-4" />
          Start Interview
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="panel rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <stat.icon className="w-4 h-4" style={{ color: 'var(--accent-text)' }} />
              <span className="label-eyebrow">{stat.label}</span>
            </div>
            <p className="text-3xl font-semibold tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>

      {error && (
        <div
          className="rounded-lg px-4 py-3 text-sm flex items-center gap-2"
          role="alert"
          style={{
            background: 'var(--danger-subtle)',
            border: '1px solid var(--danger-border)',
            color: 'var(--danger)',
          }}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="panel rounded-xl overflow-hidden">
        <div
          className="px-5 py-4 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <h2 className="text-sm font-semibold">Your Interviews</h2>
          <span className="chip tabular-nums">{total} total</span>
        </div>

        {loading ? (
          <div
            className="flex items-center justify-center gap-3 py-16"
            style={{ color: 'var(--foreground-tertiary)' }}
          >
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading your interviews…</span>
          </div>
        ) : interviews.length === 0 ? (
          <div className="py-16 text-center px-5">
            <ClipboardList className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--foreground-tertiary)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--foreground-secondary)' }}>
              No interviews yet
            </p>
            <p className="text-xs mt-1 max-w-sm mx-auto" style={{ color: 'var(--foreground-tertiary)' }}>
              Set up a role and upload a resume to run your first proctored voice interview. It will
              appear here — and only here, for your account.
            </p>
            <button onClick={startInterview} className="btn btn-primary mt-6">
              <Mic className="w-4 h-4" />
              Start your first interview
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-left border-b"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--foreground-tertiary)' }}
                >
                  <th className="px-5 py-3 font-medium label-eyebrow">Candidate</th>
                  <th className="px-5 py-3 font-medium label-eyebrow">Role</th>
                  <th className="px-5 py-3 font-medium label-eyebrow">Status</th>
                  <th className="px-5 py-3 font-medium label-eyebrow">Progress</th>
                  <th className="px-5 py-3 font-medium label-eyebrow">Started</th>
                  <th className="px-5 py-3 font-medium label-eyebrow">Analytics</th>
                  <th className="px-5 py-3 font-medium label-eyebrow text-right">Report</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                {interviews.map((interview) => {
                  const tone = TONE[statusTone(interview.status)];
                  const progress =
                    interview.total_questions > 0
                      ? Math.round((interview.current_question_index / interview.total_questions) * 100)
                      : 0;
                  const expanded = analyticsId === interview.id;

                  return (
                    <React.Fragment key={interview.id}>
                    <tr
                      className="transition-colors hover:bg-[var(--overlay-lighter)]"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold shrink-0"
                            style={{
                              background: 'var(--accent-subtle)',
                              border: '1px solid var(--accent-border)',
                              color: 'var(--accent-text)',
                            }}
                          >
                            {(interview.candidate_name || '?').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold">{interview.candidate_name || 'Unknown'}</p>
                            <p className="text-[11px] tabular-nums" style={{ color: 'var(--foreground-tertiary)' }}>
                              #{interview.id}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4" style={{ color: 'var(--foreground-secondary)' }}>
                        {interview.job_title || '—'}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap"
                          style={{ background: tone.bg, border: `1px solid ${tone.border}`, color: tone.color }}
                        >
                          <StatusIcon status={interview.status} />
                          {interview.status.charAt(0).toUpperCase() + interview.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-5 py-4 w-40">
                        <div className="flex justify-between text-[11px] mb-1" style={{ color: 'var(--foreground-tertiary)' }}>
                          <span className="tabular-nums">
                            {interview.current_question_index} / {interview.total_questions}
                          </span>
                          <span className="tabular-nums">{progress}%</span>
                        </div>
                        <div
                          className="h-1.5 rounded-full overflow-hidden"
                          style={{ background: 'var(--overlay-light)' }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${progress}%`, background: 'var(--accent)' }}
                          />
                        </div>
                      </td>
                      <td className="px-5 py-4 text-xs tabular-nums" style={{ color: 'var(--foreground-tertiary)' }}>
                        {interview.started_at
                          ? new Date(interview.started_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : 'Not started'}
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => setAnalyticsId(expanded ? null : interview.id)}
                          className="icon-btn"
                          title={expanded ? 'Hide progress charts' : 'View progress charts'}
                          aria-expanded={expanded}
                        >
                          <Activity className="w-4 h-4" />
                        </button>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => handleDownload(interview)}
                          disabled={interview.status !== 'completed' || downloadingId === interview.id}
                          className="icon-btn"
                          title={
                            interview.status === 'completed'
                              ? 'Download report'
                              : 'Complete the interview to download the report'
                          }
                        >
                          {downloadingId === interview.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr style={{ background: 'var(--overlay-lighter)' }}>
                        <td colSpan={7} className="px-6 pb-4">
                          <SessionAnalytics interviewId={interview.id} />
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-center" style={{ color: 'var(--foreground-tertiary)' }}>
        Looking for the full history view?{' '}
        <Link to="/" className="font-medium hover:opacity-80 transition-opacity" style={{ color: 'var(--accent-text)' }}>
          Open the analytics dashboard
        </Link>
      </p>
    </motion.div>
  );
};

export default Dashboard;
