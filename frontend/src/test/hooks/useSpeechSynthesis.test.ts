/**
 * Tests for the useSpeechSynthesis hook
 * Validates TTS functionality, promise resolution, and error handling
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSpeechSynthesis } from '../../hooks/useSpeechSynthesis';

describe('useSpeechSynthesis', () => {
  beforeEach(() => {
    // Reset speech synthesis state
    window.speechSynthesis.cancel();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize with correct default state', () => {
    const { result } = renderHook(() => useSpeechSynthesis());

    expect(result.current.isSpeaking).toBe(false);
    expect(result.current.isSupported).toBe(true);
    expect(typeof result.current.speak).toBe('function');
    expect(typeof result.current.stop).toBe('function');
  });

  it('should set isSpeaking to true when speaking starts', async () => {
    const { result } = renderHook(() => useSpeechSynthesis());

    let speakPromise: Promise<void>;
    act(() => {
      speakPromise = result.current.speak('Hello, this is a test question.');
    });

    // After speak is called, the mock triggers onstart synchronously
    expect(result.current.isSpeaking).toBe(true);

    // Wait for speech to finish (mock auto-ends after 50ms)
    await act(async () => {
      vi.advanceTimersByTime(100);
      await speakPromise!;
    });

    expect(result.current.isSpeaking).toBe(false);
  });

  it('should resolve the speak promise when speech ends', async () => {
    const { result } = renderHook(() => useSpeechSynthesis());

    let resolved = false;
    let speakPromise: Promise<void>;

    act(() => {
      speakPromise = result.current.speak('Test question').then(() => {
        resolved = true;
      });
    });

    expect(resolved).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(100);
      await speakPromise;
    });

    expect(resolved).toBe(true);
  });

  it('should cancel ongoing speech when stop is called', () => {
    const { result } = renderHook(() => useSpeechSynthesis());
    const cancelSpy = vi.spyOn(window.speechSynthesis, 'cancel');

    act(() => {
      result.current.speak('This is a long question');
    });

    act(() => {
      result.current.stop();
    });

    expect(cancelSpy).toHaveBeenCalled();
    expect(result.current.isSpeaking).toBe(false);
  });

  it('should cancel previous speech before starting new speech', () => {
    const { result } = renderHook(() => useSpeechSynthesis());
    const cancelSpy = vi.spyOn(window.speechSynthesis, 'cancel');

    act(() => {
      result.current.speak('First question');
    });

    act(() => {
      result.current.speak('Second question');
    });

    // cancel should be called at least twice (once at start of each speak)
    expect(cancelSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('should resolve (not reject) even on TTS error for graceful degradation', async () => {
    const { result } = renderHook(() => useSpeechSynthesis());

    // Override the mock to simulate an error
    const originalSpeak = window.speechSynthesis.speak;
    window.speechSynthesis.speak = (utterance: any) => {
      setTimeout(() => {
        if (utterance.onerror) {
          utterance.onerror({ error: 'synthesis-failed' });
        }
      }, 10);
    };

    let resolvedValue: string = '';
    await act(async () => {
      const promise = result.current.speak('Error test');
      vi.advanceTimersByTime(50);
      await promise;
      resolvedValue = 'resolved';
    });

    expect(resolvedValue).toBe('resolved'); // Should resolve, not reject
    expect(result.current.isSpeaking).toBe(false);

    // Restore
    window.speechSynthesis.speak = originalSpeak;
  });
});
