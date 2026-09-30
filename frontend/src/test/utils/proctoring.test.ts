/**
 * Tests for the pure webcam-proctoring helpers in src/utils/proctoring.ts
 *
 * Covers:
 * 1. Focus % calculation (incl. edge cases)
 * 2. Frame classification priority (tab > devices > faces > gaze)
 * 3. Smartphone / device detection flagging
 * 4. Warning trigger logic (persistence + cooldown)
 * 5. Alert message text
 */
import { describe, it, expect } from 'vitest';
import {
  computeFocusPct,
  classifyFrame,
  isDistractedStatus,
  isWarningStatus,
  shouldTriggerWarning,
  warningMessageFor,
} from '../../utils/proctoring';

describe('computeFocusPct', () => {
  it('computes a basic percentage', () => {
    expect(computeFocusPct(8, 10)).toBe(80);
    expect(computeFocusPct(3, 4)).toBe(75);
  });

  it('returns 0 when there are no frames', () => {
    expect(computeFocusPct(0, 0)).toBe(0);
    expect(computeFocusPct(5, 0)).toBe(0);
  });

  it('returns 0 when nothing was focused', () => {
    expect(computeFocusPct(0, 10)).toBe(0);
  });

  it('clamps over-counted focused frames to 100%', () => {
    expect(computeFocusPct(12, 10)).toBe(100);
  });

  it('returns 100 when fully focused', () => {
    expect(computeFocusPct(10, 10)).toBe(100);
  });
});

describe('classifyFrame', () => {
  const focused = { tabVisible: true, personCount: 1, faceCentered: true, deviceLabels: [] };

  it('marks a centred single face as focused', () => {
    expect(classifyFrame(focused)).toBe('focused');
  });

  it('flags tab-hidden above everything else', () => {
    expect(classifyFrame({ ...focused, tabVisible: false, deviceLabels: ['cell phone'] })).toBe('tab_hidden');
  });

  it('flags smartphones as phone_detected', () => {
    expect(classifyFrame({ ...focused, deviceLabels: ['cell phone'] })).toBe('phone_detected');
  });

  it('flags laptops/tablets as device_detected', () => {
    expect(classifyFrame({ ...focused, deviceLabels: ['laptop'] })).toBe('device_detected');
    expect(classifyFrame({ ...focused, deviceLabels: ['tablet'] })).toBe('device_detected');
  });

  it('is case-insensitive for device labels', () => {
    expect(classifyFrame({ ...focused, deviceLabels: ['Cell Phone'] })).toBe('phone_detected');
  });

  it('ignores harmless objects', () => {
    expect(classifyFrame({ ...focused, deviceLabels: ['chair', 'cup'] })).toBe('focused');
  });

  it('flags missing faces', () => {
    expect(classifyFrame({ ...focused, personCount: 0 })).toBe('no_face');
  });

  it('flags multiple faces', () => {
    expect(classifyFrame({ ...focused, personCount: 2 })).toBe('multi_face');
  });

  it('flags off-centre gaze as distracted', () => {
    expect(classifyFrame({ ...focused, faceCentered: false })).toBe('distracted');
  });
});

describe('status helpers', () => {
  it('focused is neither distracted nor a warning', () => {
    expect(isDistractedStatus('focused')).toBe(false);
    expect(isWarningStatus('focused')).toBe(false);
  });

  it('phone / multi-face / tab-hidden are warnings', () => {
    expect(isWarningStatus('phone_detected')).toBe(true);
    expect(isWarningStatus('device_detected')).toBe(true);
    expect(isWarningStatus('multi_face')).toBe(true);
    expect(isWarningStatus('tab_hidden')).toBe(true);
    expect(isWarningStatus('no_face')).toBe(true);
    expect(isWarningStatus('distracted')).toBe(true);
  });
});

describe('shouldTriggerWarning', () => {
  it('never fires for focused frames', () => {
    expect(shouldTriggerWarning('focused', 99, 99999)).toBe(false);
  });

  it('fires after enough consecutive bad frames', () => {
    expect(shouldTriggerWarning('distracted', 2, 0)).toBe(true);
    expect(shouldTriggerWarning('phone_detected', 2, 0)).toBe(true);
  });

  it('does not fire on a single transient frame within cooldown', () => {
    expect(shouldTriggerWarning('distracted', 1, 1000)).toBe(false);
  });

  it('fires on a single frame once the cooldown has elapsed', () => {
    expect(shouldTriggerWarning('no_face', 1, 9000)).toBe(true);
  });
});

describe('warningMessageFor', () => {
  it('mentions the phone for phone detections', () => {
    expect(warningMessageFor('phone_detected')).toMatch(/phone/i);
  });

  it('names the device for generic device detections', () => {
    expect(warningMessageFor('device_detected', 'laptop')).toMatch(/laptop/i);
  });

  it('returns empty text for focused status', () => {
    expect(warningMessageFor('focused')).toBe('');
  });
});
