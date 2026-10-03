import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Send, MessageSquare, ShieldCheck, AlertCircle, Loader2, Volume2, Download, Check, Bot, User, Repeat, Ban } from 'lucide-react';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useSpeechSynthesis } from '../../hooks/useSpeechSynthesis';
import { getInterview, downloadReport } from '../../services/api';
import BehavioralInsights from './BehavioralInsights';
import ProctorMonitor from './ProctorMonitor';

interface Props {
  interviewId: string;
}

const InterviewSession: React.FC<Props> = ({ interviewId }) => {
  const { status, messages, sendText, sendAudio } = useWebSocket(interviewId);
  const { speak, stop: cancel, isSpeaking, isSupported } = useSpeechSynthesis();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [terminatedReason, setTerminatedReason] = useState<string | null>(null);
  const [interviewDetail, setInterviewDetail] = useState<any>(null);
  const [textMode, setTextMode] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [interimText, setInterimText] = useState('');
  const isCompletedRef = useRef(false);
  const terminatedRef = useRef(false);

  // Load interview details on mount
  useEffect(() => {
    const loadDetails = async () => {
      try {
        const data = await getInterview(parseInt(interviewId));
        setInterviewDetail(data);
      } catch (err) {
        console.error('Failed to load interview details:', err);
      }
    };
    loadDetails();
  }, [interviewId]);

  // --- Refs ---
  const recognitionRef = useRef<any>(null);
  const isRecordingRef = useRef(false);
  const isStartingRef = useRef(false);
  const lastSpokenQuestionRef = useRef<string>('');
  // Most recent question received from the backend. Used for display so the UI
  // never falls back to question 1 while the interview is further along.
  const lastQuestionRef = useRef<string>('');

  // MediaRecorder for reliable audio capture
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Transcript accumulation from Web Speech API
  const transcriptBufferRef = useRef<string>('');
  const hasSpeechRef = useRef(false);

  // Timers
  const noSpeechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endOfSpeechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // --- Clear all timers utility ---
  const clearAllTimers = useCallback(() => {
    if (noSpeechTimerRef.current) {
      clearTimeout(noSpeechTimerRef.current);
      noSpeechTimerRef.current = null;
    }
    if (endOfSpeechTimerRef.current) {
      clearTimeout(endOfSpeechTimerRef.current);
      endOfSpeechTimerRef.current = null;
    }
  }, []);

  const handleTerminated = useCallback((reason: string) => {
    if (terminatedRef.current) return;
    terminatedRef.current = true;
    setTerminatedReason(reason);
    setIsCompleted(true);
    isCompletedRef.current = true;
    setIsRecording(false);
    isRecordingRef.current = false;
    setIsProcessing(false);
    clearAllTimers();
    try { cancel?.(); } catch { /* noop */ }
    if (recognitionRef.current) try { recognitionRef.current.stop(); } catch { /* ok */ }
    if (mediaRecorderRef.current?.state !== 'inactive') try { mediaRecorderRef.current?.stop(); } catch { /* ok */ }
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach((t) => t.stop()); mediaStreamRef.current = null; }
  }, [cancel, clearAllTimers]);

  // Handle new messages from backend — clear processing and detect completion
  useEffect(() => {
    if (messages.length > 0) {
      const latest: any = messages[messages.length - 1];
      if (latest.next_question || latest.error) {
        setIsProcessing(false);
      }
      // Proctor auto-close from the backend.
      if (latest.type === 'proctor_terminate' || latest.status === 'terminated') {
        const reason = latest.reason || latest.next_question || 'Interview terminated after repeated proctoring warnings.';
        console.log('[SESSION] Interview terminated by proctoring');
        handleTerminated(reason);
        return;
      }
      // Detect interview completion
      if (latest.status === 'completed') {
        console.log('[SESSION] Interview completed!');
        setIsCompleted(true);
        isCompletedRef.current = true;
        setIsRecording(false);
        isRecordingRef.current = false;
        setIsProcessing(false);
        clearAllTimers();
        // Stop any ongoing recording
        if (recognitionRef.current) try { recognitionRef.current.stop(); } catch (e) { /* ok */ }
        if (mediaRecorderRef.current?.state !== 'inactive') try { mediaRecorderRef.current?.stop(); } catch (e) { /* ok */ }
        if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(t => t.stop()); mediaStreamRef.current = null; }
      }
    }
  }, [messages, clearAllTimers, handleTerminated]);

  // --- Finalize: stop recording, send audio/text to backend ---
  const finalizeAndSend = useCallback(() => {
    console.log('[MIC] Finalizing recording and sending...');
    clearAllTimers();

    // Stop SpeechRecognition
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { /* already stopped */ }
    }

    // Stop MediaRecorder and stream
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }

    setIsRecording(false);
    isRecordingRef.current = false;
    isStartingRef.current = false;
    setIsProcessing(true);

    // Check if Web Speech API captured text
    const webSpeechTranscript = transcriptBufferRef.current.trim();

    if (webSpeechTranscript) {
      console.log('[MIC] Sending Web Speech transcript:', webSpeechTranscript);
      sendText(webSpeechTranscript);
    } else {
      // Fallback: send recorded audio blob for backend Groq Whisper STT
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      if (audioBlob.size > 1000) {
        console.log(`[MIC] No Web Speech transcript. Sending ${audioBlob.size} bytes of audio for server STT`);
        sendAudio(audioBlob);
      } else {
        // No meaningful audio — send skip message
        console.log('[MIC] No speech or audio detected, sending skip');
        sendText('[No response — candidate was silent]');
      }
    }

    // Reset buffers
    transcriptBufferRef.current = '';
    audioChunksRef.current = [];
    hasSpeechRef.current = false;
    setInterimText('');
  }, [clearAllTimers, sendText, sendAudio]);

  // --- Initialize SpeechRecognition (for real-time interim display + transcript capture) ---
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        // Speech detected — cancel the 10s no-speech timer
        if (!hasSpeechRef.current) {
          hasSpeechRef.current = true;
          if (noSpeechTimerRef.current) {
            clearTimeout(noSpeechTimerRef.current);
            noSpeechTimerRef.current = null;
            console.log('[STT] Speech detected, cancelled no-speech timer');
          }
        }

        let finalTranscript = '';
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const text = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += text;
          } else {
            interim += text;
          }
        }

        // Show interim results for visual feedback
        if (interim) {
          setInterimText(interim);
        }

        // Accumulate final transcript segments
        if (finalTranscript) {
          const trimmed = finalTranscript.trim();
          console.log('[STT] Final segment:', trimmed);
          transcriptBufferRef.current += (transcriptBufferRef.current ? ' ' : '') + trimmed;
          setInterimText('');

          // Reset end-of-speech timer: 5s after last speech → finalize
          if (endOfSpeechTimerRef.current) {
            clearTimeout(endOfSpeechTimerRef.current);
          }
          endOfSpeechTimerRef.current = setTimeout(() => {
            console.log('[STT] 5s silence after speech — finalizing');
            finalizeAndSend();
          }, 5000);
        }
      };

      recognition.onerror = (event: any) => {
        console.error('[STT] Error:', event.error);
        isStartingRef.current = false;

        if (event.error === 'not-allowed') {
          alert('Microphone access denied. Switching to text mode.');
          setTextMode(true);
          setIsRecording(false);
          isRecordingRef.current = false;
          clearAllTimers();
        }
        // For 'no-speech', 'aborted', 'network' — let onend handle restart
      };

      recognition.onend = () => {
        console.log('[STT] Recognition ended, isRecording=', isRecordingRef.current);
        isStartingRef.current = false;

        // Auto-restart if still recording and not finalizing
        if (isRecordingRef.current) {
          setTimeout(() => {
            if (!isRecordingRef.current || isStartingRef.current) return;
            try {
              isStartingRef.current = true;
              recognition.start();
              console.log('[STT] Auto-restarted');
            } catch (e) {
              console.log('[STT] Could not auto-restart');
              isStartingRef.current = false;
            }
          }, 300);
        }
      };

      recognitionRef.current = recognition;
    }

    return () => {
      clearAllTimers();
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) { /* ok */ }
      }
    };
  }, [finalizeAndSend, clearAllTimers]);

  // --- Start recording: MediaRecorder + SpeechRecognition ---
  const startRecording = useCallback(async () => {
    if (isRecordingRef.current || isStartingRef.current) {
      console.log('[MIC] Already recording/starting, skipping');
      return;
    }

    isStartingRef.current = true;

    try {
      // 1. Get microphone access and start MediaRecorder
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      transcriptBufferRef.current = '';
      hasSpeechRef.current = false;
      setInterimText('');

      // Choose a supported MIME type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.start(1000); // 1s chunks
      mediaRecorderRef.current = recorder;
      console.log(`[MIC] MediaRecorder started (${mimeType})`);

      // 2. Start SpeechRecognition for real-time feedback
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
          console.log('[STT] SpeechRecognition started');
        } catch (e) {
          console.warn('[STT] SpeechRecognition failed to start (browser may not support it)');
        }
      }

      setIsRecording(true);
      isRecordingRef.current = true;
      isStartingRef.current = false;

      // 3. Start 10s no-speech timer — auto-advance if no voice detected
      noSpeechTimerRef.current = setTimeout(() => {
        if (isRecordingRef.current && !hasSpeechRef.current) {
          console.log('[MIC] 10s no speech timeout — auto-advancing');
          finalizeAndSend();
        }
      }, 10000);

    } catch (e: any) {
      console.error('[MIC] Failed to start:', e);
      isStartingRef.current = false;
      setIsRecording(false);
      isRecordingRef.current = false;

      if (e.name === 'NotAllowedError') {
        alert('Microphone permission denied. Switching to text mode.');
        setTextMode(true);
      } else {
        alert(`Microphone error: ${e.message}. Switching to text mode.`);
        setTextMode(true);
      }
    }
  }, [finalizeAndSend]);

  // --- Stop recording manually ---
  const stopRecording = useCallback(() => {
    if (!isRecordingRef.current) return;
    console.log('[MIC] Manual stop');
    finalizeAndSend();
  }, [finalizeAndSend]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const handleSendMessage = () => {
    if (!textInput.trim() || status !== 'connected') return;
    const input = textInput;
    setTextInput('');
    setIsProcessing(true);
    sendText(input);
  };

  // --- Speak questions via TTS and auto-start mic after ---
  useEffect(() => {
    const latestMessage = messages[messages.length - 1];
    if (!latestMessage?.next_question || !isSupported) return;

    // Do NOT speak or start mic if the interview is completed
    if (latestMessage.status === 'completed' || isCompletedRef.current) {
      console.log('[TTS] Interview completed, skipping TTS');
      return;
    }

    const question = latestMessage.next_question;
    const isRepeatEcho = Boolean((latestMessage as any).is_repeat);
    lastQuestionRef.current = question;

    // Prevent speaking the same question twice — EXCEPT when the backend
    // explicitly echoed it because the candidate asked for a repeat.
    const normalize = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    if (!isRepeatEcho && normalize(question) === normalize(lastSpokenQuestionRef.current)) {
      console.warn('[TTS] Duplicate question received — skipping replay');
      if (!textMode && !isRecordingRef.current && !isStartingRef.current) {
        setTimeout(() => startRecording(), 400);
      }
      return;
    }
    lastSpokenQuestionRef.current = question;

    console.log(`[TTS] Speaking: ${question.substring(0, 50)}...`);

    // Stop any current recording before speaking
    if (isRecordingRef.current) {
      clearAllTimers();
      if (recognitionRef.current) try { recognitionRef.current.stop(); } catch (e) { /* ok */ }
      if (mediaRecorderRef.current?.state !== 'inactive') try { mediaRecorderRef.current?.stop(); } catch (e) { /* ok */ }
      if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(t => t.stop()); mediaStreamRef.current = null; }
      setIsRecording(false);
      isRecordingRef.current = false;
      isStartingRef.current = false;
    }

    // Add timeout fallback in case TTS promise never resolves
    let ttsResolved = false;
    const ttsTimeout = setTimeout(() => {
      if (!ttsResolved) {
        console.warn('[TTS] Promise did not resolve in 30s, starting mic anyway');
        if (!textMode) startRecording();
      }
    }, 30000);

    speak(question)
      .then(() => {
        ttsResolved = true;
        clearTimeout(ttsTimeout);
        console.log('[TTS] Finished, auto-starting mic...');
        // Only auto-start mic if interview is still in progress
        if (!textMode && !isCompletedRef.current) {
          setTimeout(() => startRecording(), 400);
        }
      })
      .catch((err) => {
        ttsResolved = true;
        clearTimeout(ttsTimeout);
        console.error('[TTS] Error:', err);
        if (!textMode && !isCompletedRef.current) {
          setTimeout(() => startRecording(), 400);
        }
      });
  }, [messages, speak, isSupported, textMode, startRecording, clearAllTimers]);

  const latestMsg = messages[messages.length - 1];
  // Show completion message if completed, otherwise the current question.
  // Resolution order deliberately avoids the first stored response: falling back
  // to it made the screen look stuck on question 1.
  const plannedAtProgress = Array.isArray(interviewDetail?.planned_questions)
    ? interviewDetail.planned_questions[
        Math.min(
          latestMsg?.current_index ?? interviewDetail?.current_question_index ?? 0,
          interviewDetail.planned_questions.length - 1
        )
      ]
    : null;
  const currentQuestion = isCompleted
    ? "Thank you for completing the interview! You can download your report below."
    : (latestMsg?.next_question
      || lastQuestionRef.current
      || plannedAtProgress
      || interviewDetail?.responses?.[0]?.question_text
      || "Please introduce yourself and tell me about your background.");

  // Calculate progress
  const totalQuestions = interviewDetail?.total_questions || parseInt(interviewDetail?.num_questions) || 5;
  // Prefer the backend's own counter (follow-ups do not advance it), falling back
  // to counting answered transcripts before the first message arrives.
  const answeredCount = typeof latestMsg?.current_index === 'number'
    ? latestMsg.current_index
    : messages.filter((m: any) => m.transcript).length;
  const progressPercent = Math.min((answeredCount / totalQuestions) * 100, 100);

  const handleDownloadReport = async () => {
    setIsDownloading(true);
    try {
      const candidateName = interviewDetail?.candidate?.name || 'Candidate';
      await downloadReport(parseInt(interviewId), candidateName);
    } catch (err) {
      console.error('Failed to download report:', err);
      alert('Failed to download report. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleRepeatQuestion = useCallback(() => {
    const q = lastQuestionRef.current || currentQuestion;
    if (!q || terminatedRef.current) return;
    // Local replay for instant feedback + ask backend to echo (keeps WS/TTS in sync).
    void speak(q).catch(() => undefined);
  }, [speak, currentQuestion]);

  const connected = status === 'connected';

  const terminated = terminatedReason !== null;

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Session header */}
      <div className="panel rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)' }}
          >
            <Bot className="w-4.5 h-4.5" style={{ color: 'var(--accent-text)' }} />
          </div>
          <div>
            <h3 className="font-semibold text-[15px] leading-tight">{interviewDetail?.job?.title || 'AI Interview'}</h3>
            <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--foreground-tertiary)' }}>
              <ShieldCheck className="w-3 h-3" style={{ color: 'var(--success)' }} />
              Secure session
              {interviewDetail?.candidate?.name && (
                <>
                  <span>•</span>
                  <span style={{ color: 'var(--foreground-secondary)' }}>{interviewDetail.candidate.name}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setTextMode(!textMode)}
            className="icon-btn"
            style={textMode ? { background: 'var(--accent-subtle)', borderColor: 'var(--accent-border)', color: 'var(--accent-text)' } : undefined}
            title={textMode ? 'Switch to voice mode' : 'Switch to text mode'}
          >
            {textMode ? <Mic className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
          </button>

          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border"
            style={{
              background: connected ? 'var(--success-subtle)' : 'var(--danger-subtle)',
              borderColor: connected ? 'var(--success-border)' : 'var(--danger-border)',
              color: connected ? 'var(--success)' : 'var(--danger)',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: connected ? 'var(--success)' : 'var(--danger)' }} />
            {status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Progress */}
      {!isCompleted && (
        <div className="panel rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="label-eyebrow">Interview progress</span>
            <span className="text-xs font-medium tabular-nums" style={{ color: 'var(--foreground-secondary)' }}>
              {answeredCount} / {totalQuestions} questions
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--overlay-light)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'var(--accent)' }}
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main interaction area */}
        <div className="lg:col-span-2">
          <div className="panel rounded-xl p-6 md:p-8 min-h-[420px] flex flex-col">
            <div className="flex-1 space-y-6">
              {/* Question */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="label-eyebrow">Interviewer</span>
                  {isSpeaking && (
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold"
                      style={{ background: 'var(--success-subtle)', color: 'var(--success)' }}
                    >
                      <Volume2 className="w-3 h-3" />
                      Speaking
                    </span>
                  )}
                </div>
                <motion.p
                  key={currentQuestion}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="text-xl md:text-2xl font-medium leading-relaxed"
                >
                  {currentQuestion}
                </motion.p>
              </div>

              {/* Voice visualization / status */}
              <div className="h-32 flex flex-col items-center justify-center gap-3">
                <AnimatePresence mode="wait">
                  {isRecording && (
                    <motion.div
                      key="recording"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center gap-3 w-full"
                    >
                      <div className="flex items-end gap-[3px] h-12">
                        {[...Array(16)].map((_, i) => (
                          <motion.div
                            key={i}
                            animate={{ height: [8, 28 + Math.random() * 12, 12, 24, 8] }}
                            transition={{ duration: 1 + Math.random() * 0.4, repeat: Infinity, delay: i * 0.05 }}
                            className="w-[3px] rounded-full"
                            style={{ background: 'var(--accent-light, #6366f1)' }}
                          />
                        ))}
                      </div>
                      <AnimatePresence>
                        {interimText ? (
                          <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="text-sm text-center max-w-md truncate px-4"
                            style={{ color: 'var(--foreground-secondary)' }}
                          >
                            {interimText}
                          </motion.p>
                        ) : transcriptBufferRef.current && !interimText ? (
                          <p className="text-sm text-center max-w-md truncate px-4" style={{ color: 'var(--success)' }}>
                            ✓ {transcriptBufferRef.current.substring(0, 80)}...
                          </p>
                        ) : (
                          <p className="text-sm" style={{ color: 'var(--foreground-tertiary)' }}>Listening for your answer…</p>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}

                  {isProcessing && (
                    <motion.div
                      key="processing"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2.5"
                      style={{ color: 'var(--foreground-secondary)' }}
                    >
                      <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--accent-text)' }} />
                      <span className="text-sm">Processing your answer…</span>
                    </motion.div>
                  )}

                  {!isRecording && !isProcessing && isSpeaking && (
                    <motion.p key="ai-speaking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm" style={{ color: 'var(--foreground-tertiary)' }}>
                      AI is speaking — mic will auto-start
                    </motion.p>
                  )}

                  {!isRecording && !isProcessing && !isSpeaking && !isCompleted && (
                    <motion.p key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm" style={{ color: 'var(--foreground-tertiary)' }}>
                      {textMode ? 'Type your response below' : 'Click the mic button to start answering'}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-auto pt-6">
              <div className="divider mb-6" />

              {terminated && terminatedReason && (
                <div className="mb-6 flex items-start gap-2 px-4 py-3 rounded-lg text-sm font-semibold" style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger-border)', color: 'var(--danger)' }} role="alert">
                  <Ban className="w-5 h-5 shrink-0 mt-0.5" />
                  <span>{terminatedReason}</span>
                </div>
              )}

              {isCompleted ? (
                <div className="text-center space-y-4">
                  <span
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-sm font-semibold"
                    style={terminated
                      ? { background: 'var(--danger-subtle)', color: 'var(--danger)' }
                      : { background: 'var(--success-subtle)', color: 'var(--success)' }}
                  >
                    {terminated ? <Ban className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                    {terminated ? 'Interview terminated' : 'Interview complete'}
                  </span>
                  <div>
                    <button onClick={handleDownloadReport} disabled={isDownloading} className="btn btn-primary mx-auto">
                      {isDownloading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Generating report…
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          Download PDF report
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : textMode ? (
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Type your response... (or type 'repeat the question')"
                    className="input flex-1"
                    disabled={isProcessing || terminated}
                  />
                  <button
                    onClick={handleRepeatQuestion}
                    disabled={isProcessing || terminated}
                    className="btn px-4"
                    title="Repeat the current question"
                    style={{ border: '1px solid var(--card-border)' }}
                  >
                    <Repeat className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleSendMessage}
                    disabled={isProcessing || terminated}
                    className="btn btn-primary px-4"
                  >
                    {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  </button>
                </div>
              ) : (
                <div className="flex justify-center items-center gap-6">
                  <button
                    onClick={handleRepeatQuestion}
                    disabled={isSpeaking || isProcessing || terminated}
                    className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
                    style={{ background: 'var(--overlay-light)', border: '1px solid var(--card-border)', color: 'var(--foreground-secondary)' }}
                    title="Repeat the current question"
                  >
                    <Repeat className="w-5 h-5" />
                  </button>
                  <div className="relative">
                    {isRecording && (
                      <div className="absolute inset-0 rounded-full pulse-ring" style={{ background: 'var(--danger-subtle)' }} />
                    )}
                    <button
                      onClick={toggleRecording}
                      disabled={isSpeaking || isProcessing || terminated}
                      className="relative w-20 h-20 rounded-full flex items-center justify-center transition-colors"
                      style={
                        isSpeaking || isProcessing
                          ? { background: 'var(--overlay-light)', color: 'var(--foreground-tertiary)', border: '1px solid var(--card-border)', cursor: 'not-allowed' }
                          : isRecording
                          ? { background: 'var(--danger)', color: '#fff' }
                          : { background: 'var(--accent)', color: '#fff' }
                      }
                    >
                      {isRecording ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
                    </button>
                    {!isRecording && !isSpeaking && !isProcessing && (
                      <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap">
                        <span className="text-[11px]" style={{ color: 'var(--foreground-tertiary)' }}>Click to speak</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <ProctorMonitor interviewId={interviewId} onTerminated={handleTerminated} />

          {/* Candidate skills */}
          <div className="panel rounded-xl p-5 space-y-3">
            <h4 className="label-eyebrow">Candidate skills</h4>
            <div className="flex flex-wrap gap-1.5">
              {Array.isArray(interviewDetail?.candidate?.extracted_skills) ? (
                interviewDetail.candidate.extracted_skills.map((skill: string, i: number) => (
                  <span key={i} className="chip" style={{ background: 'var(--accent-subtle)', borderColor: 'var(--accent-border)', color: 'var(--accent-text)' }}>
                    {skill}
                  </span>
                ))
              ) : typeof interviewDetail?.candidate?.extracted_skills === 'string' ? (
                (interviewDetail.candidate.extracted_skills as string).split(',').map((skill: string, i: number) => (
                  <span key={i} className="chip" style={{ background: 'var(--accent-subtle)', borderColor: 'var(--accent-border)', color: 'var(--accent-text)' }}>
                    {skill.trim()}
                  </span>
                ))
              ) : (
                <p className="text-xs" style={{ color: 'var(--foreground-tertiary)' }}>No skills extracted yet</p>
              )}
            </div>
            {interviewDetail?.candidate?.experience_summary && (
              <p className="text-xs leading-relaxed pt-2 border-t" style={{ color: 'var(--foreground-tertiary)', borderColor: 'var(--border-subtle)' }}>
                {interviewDetail.candidate.experience_summary}
              </p>
            )}
          </div>

          {/* Behavioral aggregate (when completed) */}
          {interviewDetail?.evaluation?.behavioral_summary && (
            <BehavioralInsights behavioral={{
              clarity: interviewDetail.evaluation.behavioral_summary.avg_clarity,
              confidence: interviewDetail.evaluation.behavioral_summary.avg_confidence,
              star_structure: interviewDetail.evaluation.behavioral_summary.avg_star,
              empathy_teamwork: interviewDetail.evaluation.behavioral_summary.avg_empathy,
              sentiment: interviewDetail.evaluation.behavioral_summary.avg_sentiment,
              speech_metrics: { filler_rate: interviewDetail.evaluation.behavioral_summary.avg_filler_rate, wpm: interviewDetail.evaluation.behavioral_summary.avg_wpm, word_count: null },
              summary: interviewDetail.evaluation.behavioral_summary.highlights?.[0],
              strengths: [], improvements: []
            }} />
          )}

          {/* Live transcript */}
          <div className="panel rounded-xl p-5 flex-1 overflow-hidden flex flex-col max-h-[420px]">
            <h4 className="label-eyebrow mb-3">Live transcript</h4>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {connected && messages.length === 0 && (
                <div className="flex items-center justify-center gap-2 py-8" style={{ color: 'var(--foreground-tertiary)' }}>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs">Waiting for AI interviewer…</span>
                </div>
              )}
              {messages.map((msg, i) => {
                if (msg.error) return (
                  <div key={i} className="flex items-start gap-2 p-3 rounded-lg" style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger-border)' }}>
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--danger)' }}>{msg.error}</p>
                  </div>
                );
                if (msg.transcript) return (
                  <div key={i} className="space-y-2">
                    {/* User message */}
                    <div className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'var(--overlay-light)', border: '1px solid var(--card-border)' }}>
                        <User className="w-3 h-3" style={{ color: 'var(--foreground-secondary)' }} />
                      </div>
                      <p className="text-xs leading-relaxed p-3 rounded-lg" style={{ background: 'var(--overlay-light)', color: 'var(--foreground-secondary)', border: '1px solid var(--border-subtle)' }}>
                        {msg.transcript}
                      </p>
                    </div>
                    {/* AI insight */}
                    {msg.evaluation && (
                      <div className="ml-7 space-y-1.5 pl-3 border-l" style={{ borderColor: 'var(--border-subtle)' }}>
                        <span className="label-eyebrow">AI insight</span>
                        <div className="text-[11px] p-2.5 rounded-lg" style={{ background: 'var(--overlay-lighter)', border: '1px solid var(--border-subtle)', color: 'var(--foreground-secondary)' }}>
                          {typeof msg.evaluation === 'object' && (
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="font-medium">Accuracy:</span>
                              <div className="flex gap-0.5">
                                {[...Array(10)].map((_, j) => (
                                  <span key={j} className="w-1.5 h-1.5 rounded-full" style={{ background: j < (msg.evaluation as any).technical_accuracy ? 'var(--accent)' : 'var(--card-border)' }} />
                                ))}
                              </div>
                              <span className="text-[10px] tabular-nums">{(msg.evaluation as any).technical_accuracy}/10</span>
                            </div>
                          )}
                          <p className="italic">
                            &ldquo;{typeof msg.evaluation === 'object' ? msg.evaluation.feedback : msg.evaluation}&rdquo;
                          </p>
                        </div>
                      </div>
                    )}
                    {/* Behavioral compact */}
                    {(msg as any).behavioral && <div className="ml-7"><BehavioralInsights behavioral={(msg as any).behavioral} compact /></div>}
                  </div>
                );
                return null;
              })}
              {latestMsg?.status === 'completed' && (
                <div className="mt-2 p-4 rounded-lg text-center space-y-3" style={{ background: 'var(--success-subtle)', border: '1px solid var(--success-border)' }}>
                  <Check className="w-8 h-8 mx-auto" style={{ color: 'var(--success)' }} />
                  <h5 className="font-semibold text-sm" style={{ color: 'var(--success)' }}>Interview complete</h5>
                  <button onClick={handleDownloadReport} disabled={isDownloading} className="btn btn-primary w-full">
                    {isDownloading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Downloading…
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        Download report
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InterviewSession;
