import React from 'react';

/* ============================================================
   Minimal chart primitives, pure SVG/CSS.
   - No chart library: every color is a design token, so charts
     follow dark/light theme without extra config.
   - Null values are gaps in the series, never invented zeros.
   ============================================================ */

interface LineSeries {
  name: string;
  color: string; // any CSS color / var()
  values: (number | null)[];
  dashed?: boolean;
}

export const LineChart: React.FC<{
  series: LineSeries[];
  labels: string[];
  max?: number;
  unit?: string;
}> = ({ series, labels, max = 10, unit }) => {
  const W = 600;
  const H = 180;
  const PAD_L = 30;
  const PAD_R = 10;
  const PAD_T = 10;
  const PAD_B = 26;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const n = labels.length;

  const x = (i: number) => PAD_L + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const y = (v: number) => PAD_T + innerH - (Math.max(0, Math.min(v, max)) / max) * innerH;

  // Build one polyline segment per run of non-null values.
  const segmentsFor = (values: (number | null)[]) => {
    const segs: { x1: number; y1: number }[][] = [];
    let cur: { x1: number; y1: number }[] = [];
    values.forEach((v, i) => {
      if (v === null || v === undefined || Number.isNaN(v)) {
        if (cur.length) { segs.push(cur); cur = []; }
      } else {
        cur.push({ x1: x(i), y1: y(v) });
      }
    });
    if (cur.length) segs.push(cur);
    return segs;
  };

  const ticks = [0, max / 2, max];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} stroke="var(--border-subtle)" strokeWidth={1} />
            <text x={PAD_L - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="var(--foreground-tertiary)" className="tabular-nums">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <g key={s.name}>
            {segmentsFor(s.values).map((seg, si) => (
              <polyline
                key={si}
                points={seg.map((p) => `${p.x1},${p.y1}`).join(' ')}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dashed ? '5 4' : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {s.values.map((v, i) =>
              v === null || v === undefined ? null : (
                <circle key={i} cx={x(i)} cy={y(v)} r={3} fill="var(--card-solid)" stroke={s.color} strokeWidth={1.75} />
              )
            )}
          </g>
        ))}
        {labels.map((l, i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--foreground-tertiary)">
            {l}
          </text>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--foreground-secondary)' }}>
            <span className="w-3 h-[2px] inline-block" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
        {unit && (
          <span className="text-[11px]" style={{ color: 'var(--foreground-tertiary)' }}>
            scale 0–{max}{unit}
          </span>
        )}
      </div>
    </div>
  );
};

export const Gauge: React.FC<{
  value: number | null;
  max?: number;
  label: string;
  color?: string;
  suffix?: string;
}> = ({ value, max = 10, label, color = 'var(--accent)', suffix }) => {
  const frac = value === null ? 0 : Math.max(0, Math.min(value / max, 1));
  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 120 120" className="w-24 h-24" role="img">
        <circle
          cx="60" cy="60" r="48" fill="none"
          stroke="var(--overlay-light)" strokeWidth="8"
          pathLength={100} strokeDasharray="75 100"
          transform="rotate(135 60 60)" strokeLinecap="round"
        />
        <circle
          cx="60" cy="60" r="48" fill="none"
          stroke={color} strokeWidth="8"
          pathLength={100} strokeDasharray={`${frac * 75} 100`}
          transform="rotate(135 60 60)" strokeLinecap="round"
        />
        <text x="60" y="64" textAnchor="middle" fontSize="20" fontWeight="600" fill="var(--foreground)" className="tabular-nums">
          {value === null ? '—' : `${Math.round(value * 10) / 10}${suffix ?? ''}`}
        </text>
      </svg>
      <p className="label-eyebrow">{label}</p>
    </div>
  );
};

export const Bars: React.FC<{
  values: (number | null)[];
  labels: string[];
  color?: string;
  format?: (v: number) => string;
}> = ({ values, labels, color = 'var(--accent)', format = (v) => String(Math.round(v)) }) => {
  const nums = values.filter((v): v is number => v !== null && v !== undefined);
  const maxV = nums.length ? Math.max(...nums) : 1;
  return (
    <div className="flex items-end gap-2 h-28">
      {values.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
          {v === null || v === undefined ? (
            <div className="w-full rounded-t-sm" style={{ height: 2, background: 'var(--border-subtle)' }} title="No data" />
          ) : (
            <>
              <span className="text-[10px] tabular-nums" style={{ color: 'var(--foreground-tertiary)' }}>{format(v)}</span>
              <div
                className="w-full rounded-t-sm"
                style={{ height: `${Math.max(4, (v / maxV) * 84)}px`, background: color }}
                title={format(v)}
              />
            </>
          )}
          <span className="text-[10px] truncate w-full text-center" style={{ color: 'var(--foreground-tertiary)' }}>
            {labels[i]}
          </span>
        </div>
      ))}
    </div>
  );
};

export const HBar: React.FC<{
  rows: { label: string; value: number | null; color?: string }[];
  max?: number;
}> = ({ rows, max = 10 }) => (
  <div className="space-y-2.5">
    {rows.map((r) => (
      <div key={r.label} className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-3">
        <span className="text-xs truncate" style={{ color: 'var(--foreground-secondary)' }}>{r.label}</span>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--overlay-light)' }}>
          <div
            className="h-full rounded-full"
            style={{
              width: r.value === null ? 0 : `${Math.max(0, Math.min(r.value / max, 1)) * 100}%`,
              background: r.color ?? 'var(--accent)',
            }}
          />
        </div>
        <span className="text-xs tabular-nums text-right" style={{ color: 'var(--foreground-tertiary)' }}>
          {r.value === null ? '—' : Math.round(r.value * 10) / 10}
        </span>
      </div>
    ))}
  </div>
);
