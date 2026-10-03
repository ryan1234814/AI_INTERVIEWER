import { useCallback, useEffect, useRef, useState } from 'react';
import {
  classifyFrame,
  computeFocusPct,
  isWarningStatus,
  shouldTriggerWarning,
  warningMessageFor,
  MAX_WARNINGS,
  shouldTerminateSession,
  terminationReason,
  type ProctorStatus,
} from '../utils/proctoring';
import { reportProctorEvent } from '../services/api';

export interface ProctorSnapshot {
  status: ProctorStatus;
  focusPct: number;
  warnings: number;
  warningsRemaining: number;
  maxWarnings: number;
  banner: string | null;
  deviceLabel: string | null;
  faceCount: number;
  mode: 'ai' | 'face' | 'basic';
  cameraOn: boolean;
  cameraError: string | null;
  terminated: boolean;
  terminationReason: string | null;
}

interface CocoPrediction {
  class: string;
  score: number;
  bbox: [number, number, number, number];
}

// Cached across hook instances so the model loads only once.
let cachedModel: { detect: (video: HTMLVideoElement) => Promise<CocoPrediction[]> } | null = null;
let modelLoadAttempted = false;

async function tryLoadObjectModel(): Promise<typeof cachedModel> {
  if (cachedModel) return cachedModel;
  if (modelLoadAttempted) return null;
  modelLoadAttempted = true;
  try {
    // Variable specifiers + @vite-ignore keep the build working even when
    // the optional tfjs packages are not installed; failure falls back
    // gracefully to FaceDetector / basic mode.
    const cocoName = '@tensorflow-models/coco-ssd';
    const tfName = '@tensorflow/tfjs';
    const coco = await import(/* @vite-ignore */ cocoName);
    await import(/* @vite-ignore */ tfName);
    const loader = (coco as unknown as { default?: unknown }).default ?? coco;
    const loadFn = (loader as { load?: () => Promise<typeof cachedModel> }).load;
    if (typeof loadFn !== 'function') return null;
    cachedModel = await loadFn();
    return cachedModel;
  } catch {
    return null;
  }
}

function playWarningBeep(): void {
  try {
    const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    window.setTimeout(() => { void ctx.close().catch(() => undefined); }, 500);
  } catch {
    /* audio is best-effort */
  }
}

interface Options {
  interviewId: string;
  /** Master switch — parent can disable monitoring entirely. */
  enabled?: boolean;
  /** ms between frame analyses. */
  checkIntervalMs?: number;
  /** Warn only after N consecutive bad frames (or cooldown expiry). */
  persistenceNeeded?: number;
  /** Called once when warnings exceed the limit and the session must close. */
  onTerminated?: (reason: string) => void;
}

export function useProctoring({ interviewId, enabled = true, checkIntervalMs = 1500, persistenceNeeded = 2, onTerminated }: Options) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceDetectorRef = useRef<{ detect: (v: HTMLVideoElement) => Promise<Array<{ boundingBox?: DOMRectReadOnly }>> } | null>(null);

  const totalFrames = useRef(0);
  const focusedFrames = useRef(0);
  const consecutiveBad = useRef(0);
  const lastWarningAt = useRef(0);
  const lastStatus = useRef<ProctorStatus>('unknown');
  const lastHeartbeatAt = useRef(0);
  const mounted = useRef(true);

  const [snapshot, setSnapshot] = useState<ProctorSnapshot>({
    status: 'unknown',
    focusPct: 100,
    warnings: 0,
    warningsRemaining: MAX_WARNINGS,
    maxWarnings: MAX_WARNINGS,
    banner: null,
    deviceLabel: null,
    faceCount: 0,
    mode: 'basic',
    cameraOn: false,
    cameraError: null,
    terminated: false,
    terminationReason: null,
  });
  const warningsRef = useRef(0);
  const terminatedRef = useRef(false);
  const onTerminatedRef = useRef(onTerminated);
  onTerminatedRef.current = onTerminated;

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try { t.stop(); } catch { /* noop */ }
      });
      streamRef.current = null;
    }
    setSnapshot((s) => ({ ...s, cameraOn: false }));
  }, []);

  const startCamera = useCallback(async () => {
    if (!enabled) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      if (!mounted.current) {
        stream.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } });
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        try { await video.play(); } catch { /* autoplay guard */ }
      }
      setSnapshot((s) => ({ ...s, cameraOn: true, cameraError: null }));
    } catch (e) {
      const msg = e instanceof Error && e.name === 'NotAllowedError'
        ? 'Camera permission denied. Monitoring runs in basic (tab-only) mode.'
        : 'Camera unavailable. Monitoring runs in basic (tab-only) mode.';
      setSnapshot((s) => ({ ...s, cameraOn: false, cameraError: msg }));
    }
  }, [enabled]);

  // Fire-and-forget backend logging (never throws, never blocks the loop).
  // Returns the backend verdict so callers can react to auto-termination.
  const logEvent = useCallback(async (eventType: string, detail: string | null, focusPct: number) => {
    if (!interviewId) return null;
    try {
      const res = await reportProctorEvent(Number(interviewId), {
        event_type: eventType,
        detail: detail || undefined,
        focus_score: focusPct,
      });
      if (res?.terminated && !terminatedRef.current) {
        terminatedRef.current = true;
        const reason = res.reason || terminationReason(res.warnings);
        setSnapshot((s) => ({ ...s, terminated: true, terminationReason: reason, banner: reason }));
        try { onTerminatedRef.current?.(reason); } catch { /* noop */ }
      } else if (res && typeof res.warnings === 'number') {
        // Trust the backend as source of truth for the count.
        warningsRef.current = Math.max(warningsRef.current, res.warnings);
        setSnapshot((s) => ({ ...s, warnings: warningsRef.current, warningsRemaining: Math.max(MAX_WARNINGS - warningsRef.current, 0) }));
        if (shouldTerminateSession(res.warnings) && !terminatedRef.current) {
          terminatedRef.current = true;
          const reason = res.reason || terminationReason(res.warnings);
          setSnapshot((s) => ({ ...s, terminated: true, terminationReason: reason, banner: reason }));
          try { onTerminatedRef.current?.(reason); } catch { /* noop */ }
        }
      }
      return res;
    } catch {
      return null;
    }
  }, [interviewId]);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) return;
    void startCamera();

    // Native FaceDetector (Chrome/Edge) as a lightweight middle tier.
    try {
      const FD = (window as unknown as { FaceDetector?: new () => { detect: (v: HTMLVideoElement) => Promise<Array<{ boundingBox?: DOMRectReadOnly }>> } }).FaceDetector;
      if (FD) faceDetectorRef.current = new FD();
    } catch { /* unsupported */ }

    void tryLoadObjectModel().then((m) => {
      if (mounted.current && m) setSnapshot((s) => ({ ...s, mode: 'ai' }));
      else if (mounted.current && faceDetectorRef.current) setSnapshot((s) => ({ ...s, mode: 'face' }));
    });

    const analyse = async () => {
      if (!mounted.current) return;
      const video = videoRef.current;
      const hasVideo = !!video && !!streamRef.current && video.readyState >= 2 && video.videoWidth > 0;
      const tabVisible = document.visibilityState === 'visible';

      let personCount = hasVideo ? 1 : 0;
      let faceCentered = true;
      let deviceLabels: string[] = [];
      let deviceLabel: string | null = null;

      try {
        if (cachedModel && hasVideo && video) {
          const preds = await cachedModel.detect(video);
          const persons = preds.filter((p) => p.class === 'person' && p.score > 0.4);
          personCount = persons.length;
          const devices = preds.filter(
            (p) => ['cell phone', 'laptop', 'tablet', 'computer', 'tv', 'book'].includes(p.class) && p.score > 0.4,
          );
          if (devices.length > 0) {
            devices.sort((a, b) => b.score - a.score);
            deviceLabel = devices[0].class;
            deviceLabels = devices.map((d) => d.class);
          }
          // Gaze/position heuristic: main person bbox far from frame centre
          // (looking away / left the desk) counts as distracted.
          if (persons.length === 1 && video.videoWidth > 0) {
            const [x, y, w, h] = persons[0].bbox;
            const cx = (x + w / 2) / video.videoWidth;
            const cy = (y + h / 2) / video.videoHeight;
            const area = (w * h) / (video.videoWidth * video.videoHeight);
            faceCentered = Math.abs(cx - 0.5) < 0.28 && Math.abs(cy - 0.5) < 0.3 && area > 0.02;
          } else if (persons.length === 1) {
            faceCentered = true;
          }
        } else if (faceDetectorRef.current && hasVideo && video) {
          const faces = await faceDetectorRef.current.detect(video).catch(() => []);
          personCount = faces.length;
          if (faces.length === 1 && faces[0]?.boundingBox && video.videoWidth > 0) {
            const b = faces[0].boundingBox as DOMRectReadOnly;
            const cx = (b.x + b.width / 2) / video.videoWidth;
            faceCentered = Math.abs(cx - 0.5) < 0.3;
          }
        } else if (!hasVideo) {
          // No camera — fall back to tab-visibility signal only.
          personCount = tabVisible ? 1 : 0;
          faceCentered = true;
        }
      } catch {
        /* single-frame failures must never break the loop */
      }

      const status = classifyFrame({ tabVisible, personCount, faceCentered, deviceLabels });
      totalFrames.current += 1;
      if (status === 'focused') {
        focusedFrames.current += 1;
        consecutiveBad.current = 0;
      } else {
        consecutiveBad.current = lastStatus.current === status ? consecutiveBad.current + 1 : 1;
      }
      lastStatus.current = status;
      const focusPct = computeFocusPct(focusedFrames.current, totalFrames.current);

      const now = Date.now();
      const msSinceLast = now - lastWarningAt.current;
      const fire = shouldTriggerWarning(status, consecutiveBad.current, msSinceLast, persistenceNeeded);

      let banner: string | null = null;
      if (fire && !terminatedRef.current) {
        lastWarningAt.current = now;
        warningsRef.current += 1;
        const count = warningsRef.current;
        if (shouldTerminateSession(count)) {
          terminatedRef.current = true;
          const reason = terminationReason(count);
          banner = reason;
          playWarningBeep();
          const detail = deviceLabel ? `${status} (${deviceLabel})` : status;
          void logEvent(isWarningStatus(status) ? status : 'warning', detail, focusPct);
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } });
            streamRef.current = null;
          }
          setSnapshot((s) => ({ ...s, status, focusPct, warnings: count, warningsRemaining: 0, maxWarnings: MAX_WARNINGS, faceCount: personCount, deviceLabel, banner, terminated: true, terminationReason: reason, cameraOn: false }));
          try { onTerminatedRef.current?.(reason); } catch { /* noop */ }
          return;
        }
        banner = `${warningMessageFor(status, deviceLabel || undefined)} (Warning ${count}/${MAX_WARNINGS})`;
        playWarningBeep();
        const detail = deviceLabel ? `${status} (${deviceLabel})` : status;
        void logEvent(isWarningStatus(status) ? status : 'warning', detail, focusPct);
        // Auto-hide the banner after 6s so it does not block the interview.
        window.setTimeout(() => {
          if (mounted.current) setSnapshot((s) => (s.banner === banner ? { ...s, banner: null } : s));
        }, 6000);
      } else if (now - lastHeartbeatAt.current > 20000) {
        // Periodic heartbeat keeps a focus-% trail on the backend.
        lastHeartbeatAt.current = now;
        void logEvent(status, null, focusPct);
      }

      if (!mounted.current) return;
      setSnapshot((s) => ({
        ...s,
        status,
        focusPct,
        warnings: warningsRef.current,
        warningsRemaining: Math.max(MAX_WARNINGS - warningsRef.current, 0),
        maxWarnings: MAX_WARNINGS,
        faceCount: personCount,
        deviceLabel,
        ...(banner ? { banner } : {}),
      }));
    };

    const timer = window.setInterval(() => { void analyse(); }, checkIntervalMs);

    const onVis = () => {
      if (document.visibilityState === 'hidden' && !terminatedRef.current) {
        consecutiveBad.current += 1;
        const focusPct = computeFocusPct(focusedFrames.current, totalFrames.current);
        void logEvent('tab_hidden', 'candidate left the interview tab', focusPct);
        warningsRef.current += 1;
        const count = warningsRef.current;
        if (shouldTerminateSession(count)) {
          terminatedRef.current = true;
          const reason = terminationReason(count);
          playWarningBeep();
          if (mounted.current) {
            setSnapshot((s) => ({
              ...s,
              status: 'tab_hidden',
              warnings: count,
              warningsRemaining: 0,
              maxWarnings: MAX_WARNINGS,
              banner: reason,
              terminated: true,
              terminationReason: reason,
            }));
          }
          try { onTerminatedRef.current?.(reason); } catch { /* noop */ }
          return;
        }
        playWarningBeep();
        if (mounted.current) {
          setSnapshot((s) => ({
            ...s,
            status: 'tab_hidden',
            warnings: count,
            warningsRemaining: Math.max(MAX_WARNINGS - count, 0),
            maxWarnings: MAX_WARNINGS,
            banner: `${warningMessageFor('tab_hidden')} (Warning ${count}/${MAX_WARNINGS})`,
          }));
        }
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => {
          try { t.stop(); } catch { /* noop */ }
        });
        streamRef.current = null;
      }
    };
  }, [enabled, interviewId, checkIntervalMs, persistenceNeeded, startCamera, logEvent]);

  return { videoRef, snapshot, startCamera, stopCamera };
}
