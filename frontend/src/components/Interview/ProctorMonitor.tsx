import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, CameraOff, Eye, AlertTriangle, Smartphone, Users } from 'lucide-react';
import { useProctoring } from '../../hooks/useProctoring';

interface Props {
  interviewId: string;
}

type Tone = 'success' | 'warning' | 'danger' | 'neutral';

const STATUS_STYLE: Record<string, { label: string; tone: Tone }> = {
  focused: { label: 'Focused', tone: 'success' },
  distracted: { label: 'Distracted', tone: 'warning' },
  no_face: { label: 'No Face', tone: 'warning' },
  multi_face: { label: 'Multiple Faces', tone: 'danger' },
  phone_detected: { label: 'Phone Detected', tone: 'danger' },
  device_detected: { label: 'Device Detected', tone: 'danger' },
  tab_hidden: { label: 'Tab Hidden', tone: 'danger' },
  unknown: { label: 'Starting…', tone: 'neutral' },
};

const TONE: Record<Tone, { bg: string; border: string; color: string }> = {
  success: { bg: 'var(--success-subtle)', border: 'var(--success-border)', color: 'var(--success)' },
  warning: { bg: 'var(--warning-subtle)', border: 'var(--warning-border)', color: 'var(--warning)' },
  danger: { bg: 'var(--danger-subtle)', border: 'var(--danger-border)', color: 'var(--danger)' },
  neutral: { bg: 'var(--overlay-light)', border: 'var(--card-border)', color: 'var(--foreground-secondary)' },
};

function focusColor(pct: number): string {
  if (pct >= 85) return '#10b981';
  if (pct >= 70) return '#6366f1';
  if (pct >= 50) return '#f59e0b';
  return '#ef4444';
}

const ProctorMonitor: React.FC<Props> = ({ interviewId }) => {
  const { videoRef, snapshot, startCamera, stopCamera } = useProctoring({ interviewId });
  const style = STATUS_STYLE[snapshot.status] || STATUS_STYLE.unknown;
  const tone = TONE[style.tone];
  const R = 26;
  const C = 2 * Math.PI * R;
  const offset = C - (C * Math.min(100, Math.max(0, snapshot.focusPct))) / 100;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="panel rounded-xl p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <h4 className="label-eyebrow flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5" />
          Focus monitor
        </h4>
        <button
          onClick={() => (snapshot.cameraOn ? stopCamera() : startCamera())}
          className="icon-btn w-7 h-7"
          title={snapshot.cameraOn ? 'Turn camera off' : 'Turn camera on'}
        >
          {snapshot.cameraOn ? <Camera className="w-3.5 h-3.5" /> : <CameraOff className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Camera preview */}
      <div className="relative rounded-lg overflow-hidden aspect-video" style={{ background: '#05080f', border: '1px solid var(--card-border)' }}>
        <video ref={videoRef} muted playsInline className="w-full h-full object-cover mirror" />
        {!snapshot.cameraOn && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1" style={{ color: 'var(--foreground-tertiary)' }}>
            <CameraOff className="w-6 h-6" />
            <span className="text-[11px]">Camera off — tab-only monitoring</span>
          </div>
        )}
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-semibold" style={{ background: tone.bg, border: `1px solid ${tone.border}`, color: tone.color }}>
          {style.label}
        </div>
      </div>

      {snapshot.cameraError && (
        <p className="text-[11px]" style={{ color: 'var(--warning)' }}>{snapshot.cameraError}</p>
      )}

      {/* Focus % + stats */}
      <div className="flex items-center gap-4">
        <div className="relative w-[64px] h-[64px] shrink-0">
          <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
            <circle cx="32" cy="32" r={R} fill="none" stroke="var(--overlay-light)" strokeWidth="6" />
            <circle
              cx="32" cy="32" r={R} fill="none"
              stroke={focusColor(snapshot.focusPct)}
              strokeWidth="6" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.6s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm font-semibold tabular-nums" style={{ color: focusColor(snapshot.focusPct) }}>
              {snapshot.focusPct.toFixed(0)}%
            </span>
            <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--foreground-tertiary)' }}>Focus</span>
          </div>
        </div>
        <div className="flex-1 grid grid-cols-2 gap-2">
          <div className="tile p-2 text-center">
            <div className="text-[10px] uppercase tracking-wider flex items-center justify-center gap-1" style={{ color: 'var(--foreground-tertiary)' }}>
              <AlertTriangle className="w-3 h-3" /> Warnings
            </div>
            <div className="text-sm font-semibold tabular-nums mt-0.5" style={{ color: snapshot.warnings > 0 ? 'var(--warning)' : 'var(--success)' }}>
              {snapshot.warnings}
            </div>
          </div>
          <div className="tile p-2 text-center">
            <div className="text-[10px] uppercase tracking-wider flex items-center justify-center gap-1" style={{ color: 'var(--foreground-tertiary)' }}>
              <Users className="w-3 h-3" /> Faces
            </div>
            <div className="text-sm font-semibold tabular-nums mt-0.5" style={{ color: snapshot.faceCount > 1 ? 'var(--danger)' : 'var(--foreground)' }}>
              {snapshot.faceCount}
            </div>
          </div>
        </div>
      </div>

      {snapshot.deviceLabel && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger-border)', color: 'var(--danger)' }}>
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
          {snapshot.deviceLabel} in frame — please remove it
        </div>
      )}

      {/* Warning banner */}
      <AnimatePresence>
        {snapshot.banner && (
          <motion.div
            key={snapshot.banner + snapshot.warnings}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs font-medium"
            style={{ background: 'var(--warning-subtle)', border: '1px solid var(--warning-border)', color: 'var(--warning)' }}
            role="alert"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{snapshot.banner}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-[10px]" style={{ color: 'var(--foreground-tertiary)' }}>
        Detection mode: {snapshot.mode === 'ai' ? 'AI object detection' : snapshot.mode === 'face' ? 'Face detection' : 'Tab visibility'}
        {' '}• Events are logged for the interview report.
      </p>
    </motion.div>
  );
};

export default ProctorMonitor;
