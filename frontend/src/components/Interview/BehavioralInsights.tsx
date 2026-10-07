import React from 'react';
import { Brain, MessageCircle, Star, Users, Heart, Zap, Mic2 } from 'lucide-react';

interface Props {
  behavioral: any;
  compact?: boolean;
}

const ScoreBar: React.FC<{ label: string; value: number | null; icon: React.ReactNode; fill: string }> = ({ label, value, icon, fill }) => {
  if (value == null) return null;
  const pct = Math.max(0, Math.min(10, value)) * 10;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium" style={{ color: 'var(--foreground-secondary)' }}>{icon}{label}</span>
        <span className="font-semibold tabular-nums" style={{ color: 'var(--foreground)' }}>{value.toFixed(1)}/10</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--overlay-light)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: fill }} />
      </div>
    </div>
  );
};

const BehavioralInsights: React.FC<Props> = ({ behavioral, compact }) => {
  if (!behavioral) return null;
  const sm = behavioral.speech_metrics || {};
  const star = behavioral.star_breakdown || {};

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1.5 mt-2">
        {behavioral.clarity != null && <span className="chip">Clarity {behavioral.clarity}/10</span>}
        {behavioral.confidence != null && <span className="chip">Conf {behavioral.confidence}/10</span>}
        {sm.filler_rate != null && (
          <span className="chip" style={{ background: sm.filler_rate > 8 ? 'var(--warning-subtle)' : 'var(--success-subtle)', borderColor: sm.filler_rate > 8 ? 'var(--warning-border)' : 'var(--success-border)', color: sm.filler_rate > 8 ? 'var(--warning)' : 'var(--success)' }}>
            Filler {sm.filler_rate}%
          </span>
        )}
        {behavioral.sentiment_heuristic?.label && <span className="chip capitalize">{behavioral.sentiment_heuristic.label}</span>}
      </div>
    );
  }

  return (
    <div className="panel rounded-xl p-5 space-y-4">
      <h4 className="label-eyebrow flex items-center gap-1.5">
        <Brain className="w-3.5 h-3.5" />
        Behavioral &amp; soft-skill analysis
      </h4>

      <div className="grid grid-cols-1 gap-3">
        <ScoreBar label="Clarity" value={behavioral.clarity} icon={<MessageCircle className="w-3 h-3" />} fill="var(--accent)" />
        <ScoreBar label="Confidence" value={behavioral.confidence} icon={<Zap className="w-3 h-3" />} fill="var(--accent)" />
        <ScoreBar label="STAR Structure" value={behavioral.star_structure} icon={<Star className="w-3 h-3" />} fill="var(--warning)" />
        <ScoreBar label="Empathy / Teamwork" value={behavioral.empathy_teamwork} icon={<Users className="w-3 h-3" />} fill="var(--success)" />
        <ScoreBar label="Sentiment" value={behavioral.sentiment} icon={<Heart className="w-3 h-3" />} fill="var(--accent)" />
      </div>

      <div className="grid grid-cols-3 gap-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="tile p-2 text-center">
          <div className="text-[10px] uppercase tracking-wider flex items-center justify-center gap-1" style={{ color: 'var(--foreground-tertiary)' }}><Mic2 className="w-3 h-3" /> Words</div>
          <div className="text-sm font-semibold tabular-nums mt-0.5" style={{ color: 'var(--foreground)' }}>{sm.word_count ?? '-'}</div>
        </div>
        <div className="tile p-2 text-center">
          <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--foreground-tertiary)' }}>Filler Rate</div>
          <div className="text-sm font-semibold tabular-nums mt-0.5" style={{ color: sm.filler_rate > 8 ? 'var(--warning)' : 'var(--success)' }}>{sm.filler_rate != null ? `${sm.filler_rate}%` : '-'}</div>
        </div>
        <div className="tile p-2 text-center">
          <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--foreground-tertiary)' }}>WPM</div>
          <div className="text-sm font-semibold tabular-nums mt-0.5" style={{ color: 'var(--foreground)' }}>{sm.wpm || '-'}</div>
        </div>
      </div>

      {sm.filler_words_found?.length > 0 && (
        <p className="text-[11px]" style={{ color: 'var(--foreground-tertiary)' }}>
          Fillers: <span style={{ color: 'var(--warning)' }}>{sm.filler_words_found.join(', ')}</span>
        </p>
      )}

      {(star.situation != null || star.action != null) && (
        <div className="flex gap-1.5 flex-wrap">
          {(['situation','task','action','result'] as const).map(k => star[k] != null && (
            <span key={k} className="chip capitalize">{k} {star[k]}/10</span>
          ))}
        </div>
      )}

      {behavioral.summary && <p className="text-xs leading-relaxed" style={{ color: 'var(--foreground-secondary)' }}>&ldquo;{behavioral.summary}&rdquo;</p>}

      <div className="flex gap-2 flex-wrap">
        {behavioral.strengths?.map((s: string, i: number) => (
          <span key={i} className="chip" style={{ background: 'var(--success-subtle)', borderColor: 'var(--success-border)', color: 'var(--success)' }}>✓ {s}</span>
        ))}
        {behavioral.improvements?.map((s: string, i: number) => (
          <span key={i} className="chip" style={{ background: 'var(--warning-subtle)', borderColor: 'var(--warning-border)', color: 'var(--warning)' }}>↗ {s}</span>
        ))}
      </div>
    </div>
  );
};

export default BehavioralInsights;
