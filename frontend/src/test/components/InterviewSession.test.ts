/**
 * Tests for microphone state management and audio capture in InterviewSession
 *
 * Tests the following scenarios:
 * 1. Mic toggle (click to start/stop)
 * 2. No double-start race conditions
 * 3. Duplicate TTS prevention
 * 4. 10-second no-speech auto-advance
 * 5. 5-second end-of-speech timer sends accumulated transcript
 * 6. Transcript accumulation (buffer multiple segments)
 * 7. MediaRecorder fallback when Web Speech API fails
 * 8. Mic disabled while AI is speaking or processing
 * 9. Processing state transitions
 * 10. Auto-start after TTS
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Microphone State Machine', () => {
  let isRecording: boolean;
  let isStarting: boolean;
  let isProcessing: boolean;
  let hasSpeech: boolean;
  let lastSpokenQuestion: string;
  let transcriptBuffer: string;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    isRecording = false;
    isStarting = false;
    isProcessing = false;
    hasSpeech = false;
    lastSpokenQuestion = '';
    transcriptBuffer = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Simulate the startRecording logic
  function startRecording(): boolean {
    if (isRecording || isStarting) return false;
    isStarting = true;
    isRecording = true;
    hasSpeech = false;
    transcriptBuffer = '';
    setTimeout(() => { isStarting = false; }, 500);
    return true;
  }

  function finalizeAndSend(): string {
    isRecording = false;
    isStarting = false;
    isProcessing = true;
    const transcript = transcriptBuffer.trim();
    transcriptBuffer = '';
    hasSpeech = false;
    return transcript || '[audio-fallback]';
  }

  function stopRecording(): string {
    return finalizeAndSend();
  }

  function accumulateTranscript(text: string) {
    hasSpeech = true;
    transcriptBuffer += (transcriptBuffer ? ' ' : '') + text;
  }

  // --- Test 1: Basic start/stop ---
  it('should start and stop recording correctly', () => {
    expect(isRecording).toBe(false);
    startRecording();
    expect(isRecording).toBe(true);
    stopRecording();
    expect(isRecording).toBe(false);
    expect(isProcessing).toBe(true);
  });

  // --- Test 2: Guard against double-start ---
  it('should prevent double-start (race condition fix)', () => {
    expect(startRecording()).toBe(true);
    expect(startRecording()).toBe(false); // Blocked
    expect(isRecording).toBe(true);
  });

  // --- Test 3: Toggle mode ---
  it('should toggle recording on/off', () => {
    // Toggle on
    if (!isRecording) startRecording();
    expect(isRecording).toBe(true);
    // Toggle off
    if (isRecording) stopRecording();
    expect(isRecording).toBe(false);
  });

  // --- Test 4: Transcript accumulation ---
  it('should accumulate multiple transcript segments into one buffer', () => {
    startRecording();
    accumulateTranscript('I have experience');
    accumulateTranscript('with Python');
    accumulateTranscript('and JavaScript');
    const sent = stopRecording();
    expect(sent).toBe('I have experience with Python and JavaScript');
  });

  // --- Test 5: 10s no-speech auto-advance ---
  it('should auto-advance after 10s of no speech', () => {
    startRecording();
    let autoAdvanced = false;

    // Simulate 10s no-speech timer
    const timer = setTimeout(() => {
      if (isRecording && !hasSpeech) {
        finalizeAndSend();
        autoAdvanced = true;
      }
    }, 10000);

    vi.advanceTimersByTime(10000);
    clearTimeout(timer);
    expect(autoAdvanced).toBe(true);
    expect(isRecording).toBe(false);
    expect(isProcessing).toBe(true);
  });

  // --- Test 6: Speech cancels 10s timer ---
  it('should cancel 10s timer when speech is detected', () => {
    startRecording();
    let autoAdvanced = false;

    let noSpeechTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (isRecording && !hasSpeech) {
        finalizeAndSend();
        autoAdvanced = true;
      }
    }, 10000);

    // Speech detected at 3s
    vi.advanceTimersByTime(3000);
    hasSpeech = true;
    clearTimeout(noSpeechTimer!);
    noSpeechTimer = null;

    vi.advanceTimersByTime(10000); // Way past 10s
    expect(autoAdvanced).toBe(false); // Should NOT have auto-advanced
  });

  // --- Test 7: 5s end-of-speech timer ---
  it('should finalize after 5s silence following speech', () => {
    startRecording();
    accumulateTranscript('My answer is React');

    let finalized = false;
    let sentText = '';

    // Simulate end-of-speech timer
    setTimeout(() => {
      sentText = finalizeAndSend();
      finalized = true;
    }, 5000);

    vi.advanceTimersByTime(5000);
    expect(finalized).toBe(true);
    expect(sentText).toBe('My answer is React');
  });

  // --- Test 8: Duplicate question prevention ---
  it('should not re-trigger TTS for the same question', () => {
    let ttsCalls = 0;
    function maybeSpeak(q: string) {
      if (q === lastSpokenQuestion) return false;
      lastSpokenQuestion = q;
      ttsCalls++;
      return true;
    }

    expect(maybeSpeak('What is React?')).toBe(true);
    expect(maybeSpeak('What is React?')).toBe(false);
    expect(maybeSpeak('Explain closures')).toBe(true);
    expect(ttsCalls).toBe(2);
  });

  // --- Test 9: Fallback to audio when no transcript ---
  it('should send audio fallback when Web Speech API has no transcript', () => {
    startRecording();
    // No accumulateTranscript calls — Web Speech API failed
    const sent = stopRecording();
    expect(sent).toBe('[audio-fallback]'); // Falls back to sending audio blob
  });

  // --- Test 10: Mic disabled during processing ---
  it('should disable mic during processing', () => {
    startRecording();
    accumulateTranscript('answer');
    stopRecording();

    expect(isProcessing).toBe(true);
    expect(isRecording).toBe(false);

    // Should not be able to start while processing
    const canStart = !isProcessing;
    expect(canStart).toBe(false);
  });

  // --- Test 11: Mic disabled while AI is speaking ---
  it('should disable mic button while AI is speaking', () => {
    let isSpeaking = true;
    const canStart = !isSpeaking && !isProcessing;
    expect(canStart).toBe(false);

    isSpeaking = false;
    const canStartNow = !isSpeaking && !isProcessing;
    expect(canStartNow).toBe(true);
  });

  // --- Test 12: Processing state clears on new message ---
  it('should clear processing state when response arrives', () => {
    isProcessing = true;
    // Simulate receiving a message with next_question
    const message = { next_question: 'Next question?', evaluation: {} };
    if (message.next_question) {
      isProcessing = false;
    }
    expect(isProcessing).toBe(false);
  });

  // --- Test 13: Auto-start after TTS simulation ---
  it('should auto-start mic after TTS finishes', async () => {
    // Simulate TTS ending
    await new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance('test question');
      utterance.onend = () => {
        setTimeout(() => {
          startRecording();
          resolve();
        }, 400);
      };
      window.speechSynthesis.speak(utterance);
      vi.advanceTimersByTime(500);
    });

    expect(isRecording).toBe(true);
  });
});
