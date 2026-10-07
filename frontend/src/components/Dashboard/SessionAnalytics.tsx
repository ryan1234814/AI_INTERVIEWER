import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import {
  getInterviewAnalytics, InterviewAnalytics, getApiError,
} from '../../services/api';
import { LineChart, Gauge, Bars, HBar } from '../Charts/MiniCharts';

/* ============================================================
   Per-session progress: score trajectory, delivery, integrity
   and the candidate's cross-session trend. Charts are honest —
   missing measurements render as gaps, not zeros.
   ============================================================ */

const EVENT_TONE: Record<string, string> = {
  focused: 'var(--success)',
  heartbeat: 'var(--border-subtle)',
  distracted: 'var(--warning)',
  no_face: 'var(--warning)',
  multi_face: 'var(--danger)',
  phone_detected: 'var(--danger)',
  device_detected: 'var(--danger)',
  tab_hidden: 'var(--warning)',
  warning: 'var(--danger)',
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

const Section: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({ title, note, children }) => (
  <div className="border-t pt-4" style={{ borderColor: 'var(--border-subtle)' }}>
    <div className="flex items-baseline justify-between gap-4 mb-3">
      <h4 className="label-eyebrow">{title}</h4>
      {note && <span className="text-[11px]" style={{ color: 'var(--foreground-tertiary)' }}>{note}</span>}
    </div>
    {children}
  </div>
);

const SessionAnalytics: React.FC<{ interviewId: number }> = ({ interviewId }) => {
  const [data, setData] = useState<InterviewAnalytics | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getInterviewAnalytics(interviewId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(getApiError(e, 'Failed to load session analytics.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [interviewId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 justify-center" style={{ color: 'var(--foreground-tertiary)' }}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading progress…</span>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm" style={{ color: 'var(--danger)' }}>
        <AlertCircle className="w-4 h-4" /> {error || 'No data'}
      </div>
    );
  }

  const { interview, per_question, evaluation, proctor, candidate_history } = data;
  const labels = per_question.map((q) => `Q${q.n}`);

  // --- Cross-session trend (only completed, scored sessions of this candidate) ---
  const trend = candidate_history.filter((h) => h.overall_score !== null);

  // --- Integrity strip: last events colored by type ---
  const strip = proctor.timeline.slice(-60);

  return (
    <div className="space-y-6 py-6 px-1">
      {/* Summary line */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm" style={{ color: 'var(--foreground-secondary)' }}>
          {per_question.length} of {interview.total_questions} questions answered
          {interview.status === 'ongoing' && ' — session in progress'}
        </p>
        <p className="text-[11px] tabular-nums" style={{ color: 'var(--foreground-tertiary)' }}>
          started {fmtDate(interview.started_at)}
          {interview.completed_at ? ` · finished ${fmtDate(interview.completed_at)}` : ''}
        </p>
      </div>

      {per_question.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--foreground-tertiary)' }}>
          No scored answers yet — charts appear once the candidate responds to the first question.
        </p>
      )}

      {per_question.length > 0 && (
        <>
          {/* Headline gauges + rubric breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="flex justify-center gap-8">
              <Gauge
                value={evaluation?.overall_score ?? null}
                label="Overall / 10"
                color="var(--accent)"
              />
              <Gauge
                value={proctor.summary ? proctor.summary.focus_pct : null}
                max={100}
                label="Focus %"
                suffix="%"
                color={
                  !proctor.summary || proctor.summary.focus_pct >= 70
                    ? 'var(--success)'
                    : proctor.summary.focus_pct >= 50
                      ? 'var(--warning)'
                      : 'var(--danger)'
                }
              />
            </div>
            <Section title="Rubric" note={evaluation ? 'final evaluation' : 'pending completion'}>
              <HBar
                rows={[
                  { label: 'Technical', value: evaluation?.technical_score ?? null },
                  { label: 'Communication', value: evaluation?.communication_score ?? null },
                  { label: 'Relevance', value: evaluation?.relevance_score ?? null },
                  { label: 'STAR structure', value: evaluation?.avg_star ?? null, color: 'var(--warning)' },
                  { label: 'Confidence', value: evaluation?.avg_confidence ?? null, color: 'var(--success)' },
                ]}
              />
            </Section>
          </div>

          {/* Per-question trajectory */}
          <Section title="Score trajectory per question" note="unmeasured values show as gaps">
            <LineChart
              labels={labels}
              max={10}
              series={[
                { name: 'Technical score', color: 'var(--accent)', values: per_question.map((q) => q.score) },
                { name: 'Clarity', color: 'var(--success)', values: per_question.map((q) => q.clarity), dashed: true },
                { name: 'Confidence', color: 'var(--warning)', values: per_question.map((q) => q.confidence), dashed: true },
              ]}
            />
          </Section>

          {/* Delivery */}
          <Section
            title="Speaking pace (words per minute)"
            note={evaluation?.avg_filler_rate != null ? `avg filler rate ${evaluation.avg_filler_rate}/min` : undefined}
          >
            <Bars
              labels={labels}
              values={per_question.map((q) => q.wpm)}
              color="var(--accent-text)"
            />
          </Section>

          {/* Integrity */}
          {proctor.summary && proctor.summary.total_events > 0 && (
            <Section
              title="Session integrity timeline"
              note={`${proctor.summary.warnings} warning${proctor.summary.warnings === 1 ? '' : 's'} · ${proctor.summary.integrity}`}
            >
              <div className="flex gap-[3px] h-6 items-stretch mb-2">
                {strip.map((e, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-sm min-w-[3px]"
                    style={{ background: EVENT_TONE[e.event_type] ?? 'var(--border-subtle)' }}
                    title={`${e.event_type}${e.focus_score != null ? ` · focus ${Math.round(e.focus_score)}%` : ''}${e.t ? ` · ${new Date(e.t).toLocaleTimeString()}` : ''}`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(proctor.summary.counts)
                  .filter(([k, v]) => v > 0 && k !== 'heartbeat')
                  .map(([k, v]) => (
                    <span
                      key={k}
                      className="chip"
                      style={{ color: EVENT_TONE[k] ?? 'var(--foreground-secondary)' }}
                    >
                      {k.replace(/_/g, ' ')} · {v}
                    </span>
                  ))}
              </div>
            </Section>
          )}
        </>
      )}

      {/* Cross-session progress */}
      <Section
        title="Candidate progress across sessions"
        note={trend.length >= 2 ? `${trend.length} scored sessions` : undefined}
      >
        {trend.length >= 2 ? (
          <LineChart
            max={10}
            labels={trend.map((h) => `#${h.interview_id}`)}
            series={[{ name: 'Overall score', color: 'var(--accent)', values: trend.map((h) => h.overall_score) }]}
          />
        ) : (
          <p className="text-sm" style={{ color: 'var(--foreground-tertiary)' }}>
            {trend.length === 1
              ? 'One scored session so far — the trend line starts with this candidate’s second completed interview.'
              : 'No completed, scored session yet for this candidate.'}
          </p>
        )}
      </Section>
    </div>
  );
};

export default SessionAnalytics;
