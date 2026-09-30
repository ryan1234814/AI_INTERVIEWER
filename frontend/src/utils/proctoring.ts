/**
 * Pure proctoring helpers — no DOM, no side effects.
 * Covered by vitest suite `src/test/utils/proctoring.test.ts`.
 */

export type ProctorStatus =
  | 'focused'
  | 'distracted'
  | 'no_face'
  | 'multi_face'
  | 'phone_detected'
  | 'device_detected'
  | 'tab_hidden'
  | 'unknown';

export interface FrameSignals {
  /** Is the interview tab currently visible? */
  tabVisible: boolean;
  /** Number of people visible in the camera frame. */
  personCount: number;
  /** True when the main face/person bbox is roughly centred on screen. */
  faceCentered: boolean;
  /** Lower-cased object labels seen in the frame (COCO vocabulary). */
  deviceLabels: string[];
}

export const DEVICE_LABELS = new Set([
  'cell phone',
  'laptop',
  'tablet',
  'computer',
  'tv',
  'book',
]);

export const PHONE_LABELS = new Set(['cell phone']);

export const WARNING_MESSAGES: Record<string, string> = {
  distracted: 'You seem distracted. Please focus on the screen.',
  no_face: 'No face detected. Please sit in front of the camera.',
  multi_face: 'Multiple faces detected. Only the candidate should be visible.',
  phone_detected: 'Smartphone detected! Please put your phone away.',
  device_detected: 'Unauthorised device detected! Please remove it from view.',
  tab_hidden: 'Tab switch detected! Please stay on the interview tab.',
};

/** Focus % = focused frames / total frames * 100. Returns 0 when empty. */
export function computeFocusPct(focusedFrames: number, totalFrames: number): number {
  const total = Math.floor(Number(totalFrames));
  const focused = Math.floor(Number(focusedFrames));
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (!Number.isFinite(focused) || focused <= 0) return 0;
  const clamped = Math.max(0, Math.min(focused, total));
  return Math.round((clamped / total) * 1000) / 10;
}

function firstProhibitedDevice(labels: string[]): string | null {
  for (const raw of labels || []) {
    const label = String(raw || '').trim().toLowerCase();
    if (DEVICE_LABELS.has(label)) return label;
  }
  return null;
}

/**
 * Classify one analysed camera frame into a proctor status.
 * Priority: tab visibility > devices > face presence > gaze/position.
 */
export function classifyFrame(signals: FrameSignals): ProctorStatus {
  if (!signals.tabVisible) return 'tab_hidden';

  const device = firstProhibitedDevice(signals.deviceLabels || []);
  if (device) {
    return PHONE_LABELS.has(device) ? 'phone_detected' : 'device_detected';
  }

  const persons = Math.max(0, Math.floor(Number(signals.personCount) || 0));
  if (persons === 0) return 'no_face';
  if (persons > 1) return 'multi_face';
  if (!signals.faceCentered) return 'distracted';
  return 'focused';
}

/** True when the status counts as "distracted" for focus-% purposes. */
export function isDistractedStatus(status: ProctorStatus): boolean {
  return status !== 'focused' && status !== 'unknown';
}

/** True when the status should raise a visible warning to the candidate. */
export function isWarningStatus(status: ProctorStatus): boolean {
  return (
    status === 'distracted' ||
    status === 'no_face' ||
    status === 'multi_face' ||
    status === 'phone_detected' ||
    status === 'device_detected' ||
    status === 'tab_hidden'
  );
}

/**
 * Decide whether a warning alert should fire right now.
 * Fires when the current status is a warning status AND either it has
 * persisted for `persistenceNeeded` consecutive checks OR `cooldownMs`
 * has elapsed since the last warning of any kind.
 */
export function shouldTriggerWarning(
  status: ProctorStatus,
  consecutiveCount: number,
  msSinceLastWarning: number,
  persistenceNeeded = 2,
  cooldownMs = 8000,
): boolean {
  if (!isWarningStatus(status)) return false;
  if (consecutiveCount >= persistenceNeeded) return true;
  return msSinceLastWarning >= cooldownMs;
}

/** Human-readable alert text for a status (empty string when no alert). */
export function warningMessageFor(status: ProctorStatus, deviceLabel?: string): string {
  if (status === 'device_detected' && deviceLabel) {
    return `Unauthorised device detected (${deviceLabel})! Please remove it from view.`;
  }
  return WARNING_MESSAGES[status] || '';
}
