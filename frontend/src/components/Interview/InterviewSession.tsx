import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Send, MessageSquare, Shield, AlertCircle, Loader2, Sparkles, Volume2, Download, Check, Bot, User } from 'lucide-react';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useSpeechSynthesis } from '../../hooks/useSpeechSynthesis';
import { getInterview, downloadReport } from '../../services/api';

interface Props {
  interviewId: string;
}

const InterviewSession: React.FC<Props> = ({ interviewId }) => {
  const { status, messages, sendText, sendAudio } = useWebSocket(interviewId);
  const { speak, isSpeaking, isSupported } = useSpeechSynthesis();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [interviewDetail, setInterviewDetail] = useState<any>(null);
  const [textMode, setTextMode] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [interimText, setInterimText] = useState('');
  const isCompletedRef = useRef(false);

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

  // Handle new messages from backend — clear processing and detect completion
  useEffect(() => {
    if (messages.length > 0) {
      const latest = messages[messages.length - 1];
      if (latest.next_question || latest.error) {
        setIsProcessing(false);
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
  }, [messages, clearAllTimers]);

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

    // Prevent speaking the same question twice
    if (question === lastSpokenQuestionRef.current) return;
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
  // Show completion message if completed, otherwise show current question
  const currentQuestion = isCompleted
    ? "Thank you for completing the interview! You can download your report below."
    : (latestMsg?.next_question || interviewDetail?.responses?.[0]?.question_text || "Please introduce yourself and tell me about your background.");

  // Calculate progress
  const totalQuestions = interviewDetail?.total_questions || parseInt(interviewDetail?.num_questions) || 5;
  const answeredCount = messages.filter((m: any) => m.transcript).length;
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

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Session Header */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-5 rounded-3xl flex flex-wrap items-center justify-between gap-4"
      >
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500/20 to-emerald-500/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="font-bold text-lg">{interviewDetail?.job?.title || 'AI Interview'}</h3>
            <p className="text-white/40 text-sm flex items-center gap-1.5">
              <Shield className="w-3 h-3" /> Secure AI Session
              {interviewDetail?.candidate?.name && (
                <>
                  <span className="text-white/20">•</span>
                  <span>{interviewDetail.candidate.name}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Text mode toggle */}
          <button
            onClick={() => setTextMode(!textMode)}
            className={`p-2.5 rounded-xl transition-all duration-300 ${
              textMode 
                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30' 
                : 'bg-white/5 hover:bg-white/10 text-white/60 border border-transparent'
            }`}
            title={textMode ? 'Switch to voice mode' : 'Switch to text mode'}
          >
            {textMode ? <Mic className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
          </button>

          {/* Connection status */}
          <div className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${
            status === 'connected' 
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            {status.toUpperCase()}
          </div>
        </div>
      </motion.div>

      {/* Progress Bar */}
      {!isCompleted && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-4 rounded-2xl"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-white/40">Interview Progress</span>
            <span className="text-xs font-bold text-white/60">{answeredCount} / {totalQuestions} questions</span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-gradient-to-r from-blue-500 via-emerald-500 to-blue-500 rounded-full bg-[length:200%_100%] animate-gradient-shift"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Interaction Area */}
        <div className="lg:col-span-2 space-y-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 }}
            className="glass-card p-8 rounded-[2.5rem] relative overflow-hidden min-h-[420px] flex flex-col"
          >
            {/* Subtle gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.02] via-transparent to-emerald-500/[0.02] pointer-events-none" />

            <div className="relative flex-1 space-y-8">
              {/* Question Display */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-blue-500/15 flex items-center justify-center">
                    <Bot className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <span className="text-[11px] font-bold text-blue-400 uppercase tracking-widest">Interviewer</span>
                  {isSpeaking && (
                    <div className="flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                      <Volume2 className="w-3 h-3 text-emerald-400" />
                      <span className="text-[10px] text-emerald-400 font-bold">Speaking</span>
                      <div className="flex items-end gap-0.5 h-3">
                        {[...Array(3)].map((_, i) => (
                          <div
                            key={i}
                            className="w-0.5 bg-emerald-400 rounded-full animate-pulse"
                            style={{ height: `${4 + i * 3}px`, animationDelay: `${i * 0.15}s` }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <motion.p 
                  key={currentQuestion}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xl md:text-2xl font-medium leading-relaxed pl-8"
                >
                  {currentQuestion}
                </motion.p>
              </div>

              {/* Voice Visualization / Status */}
              <div className="h-32 flex flex-col items-center justify-center gap-3">
                <AnimatePresence mode="wait">
                  {isRecording && (
                    <motion.div
                      key="recording"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="flex flex-col items-center gap-3"
                    >
                      {/* Waveform */}
                      <div className="flex items-end gap-1 h-12">
                        {[...Array(16)].map((_, i) => (
                          <motion.div
                            key={i}
                            animate={{ height: [8, 32 + Math.random() * 16, 12, 28 + Math.random() * 12, 8] }}
                            transition={{ duration: 1 + Math.random() * 0.5, repeat: Infinity, delay: i * 0.06 }}
                            className="w-1 bg-gradient-to-t from-blue-500 to-blue-400 rounded-full"
                          />
                        ))}
                      </div>
                      {/* Live interim transcription feedback */}
                      <AnimatePresence>
                        {interimText ? (
                          <motion.p 
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="text-white/40 text-sm italic text-center max-w-md truncate px-4"
                          >
                            {interimText}
                          </motion.p>
                        ) : transcriptBufferRef.current && !interimText ? (
                          <p className="text-emerald-400/60 text-sm italic text-center max-w-md truncate px-4">
                            ✓ {transcriptBufferRef.current.substring(0, 80)}...
                          </p>
                        ) : (
                          <p className="text-white/20 text-sm font-light italic">Listening for your answer...</p>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}

                  {isProcessing && (
                    <motion.div
                      key="processing"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="flex items-center gap-3 text-blue-400/80"
                    >
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-sm font-medium">Processing your answer...</span>
                    </motion.div>
                  )}

                  {!isRecording && !isProcessing && isSpeaking && (
                    <motion.div
                      key="ai-speaking"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2"
                    >
                      <div className="flex items-end gap-0.5 h-4">
                        {[...Array(5)].map((_, i) => (
                          <div
                            key={i}
                            className="w-0.5 bg-emerald-400/40 rounded-full animate-pulse"
                            style={{ height: `${4 + i * 2}px`, animationDelay: `${i * 0.1}s` }}
                          />
                        ))}
                      </div>
                      <p className="text-white/30 text-sm font-light italic">AI is speaking — mic will auto-start</p>
                    </motion.div>
                  )}

                  {!isRecording && !isProcessing && !isSpeaking && !isCompleted && (
                    <motion.div
                      key="idle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-center"
                    >
                      <p className="text-white/20 text-sm font-light italic">
                        {textMode ? 'Type your response below' : 'Click the mic button to start answering'}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Interaction Footer */}
            <div className="relative mt-auto pt-8">
              <div className="h-px bg-gradient-to-r from-transparent via-white/5 to-transparent absolute top-0 left-0 right-0" />
              
              {isCompleted ? (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center space-y-4 pt-2"
                >
                  <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold">
                    <Check className="w-4 h-4" />
                    Interview Complete
                  </div>
                  <div>
                    <button
                      onClick={handleDownloadReport}
                      disabled={isDownloading}
                      className="px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold transition-all duration-300 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 flex items-center justify-center gap-2 mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Generating Report...
                        </>
                      ) : (
                        <>
                          <Download className="w-5 h-5" />
                          Download PDF Report
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              ) : textMode ? (
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Type your response..."
                    className="flex-1 bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.05] transition-all text-white placeholder:text-white/20"
                    disabled={isProcessing}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={isProcessing}
                    className="p-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white transition-all duration-300 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 disabled:opacity-50"
                  >
                    {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  </button>
                </div>
              ) : (
                <div className="flex justify-center">
                  <div className="relative">
                    {/* Pulse rings when recording */}
                    {isRecording && (
                      <>
                        <div className="absolute inset-0 rounded-full bg-red-500/20 pulse-ring" />
                        <div className="absolute inset-0 rounded-full bg-red-500/15 pulse-ring" style={{ animationDelay: '0.5s' }} />
                      </>
                    )}
                    <button
                      onClick={toggleRecording}
                      disabled={isSpeaking || isProcessing}
                      className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${
                        isSpeaking || isProcessing
                          ? 'bg-white/5 text-white/20 cursor-not-allowed border border-white/5'
                          : isRecording
                          ? 'bg-red-500 text-white shadow-[0_0_50px_rgba(239,68,68,0.35)] scale-105'
                          : 'bg-gradient-to-br from-blue-500 to-blue-600 text-white hover:from-blue-400 hover:to-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)] hover:shadow-[0_0_40px_rgba(59,130,246,0.4)] hover:scale-105 active:scale-95'
                      }`}
                    >
                      {isRecording ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Candidate Skills */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-card p-6 rounded-3xl space-y-4"
          >
            <h4 className="text-xs font-bold text-white/40 uppercase tracking-widest">Candidate Skills</h4>
            <div className="flex flex-wrap gap-1.5">
              {Array.isArray(interviewDetail?.candidate?.extracted_skills) ? (
                interviewDetail.candidate.extracted_skills.map((skill: string, i: number) => (
                  <span key={i} className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/8 text-[11px] font-medium text-white/60 hover:text-white/80 hover:border-white/15 transition-colors">
                    {skill}
                  </span>
                ))
              ) : typeof interviewDetail?.candidate?.extracted_skills === 'string' ? (
                (interviewDetail.candidate.extracted_skills as string).split(',').map((skill: string, i: number) => (
                  <span key={i} className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/8 text-[11px] font-medium text-white/60 hover:text-white/80 hover:border-white/15 transition-colors">
                    {skill.trim()}
                  </span>
                ))
              ) : (
                <p className="text-xs text-white/30 italic">No skills extracted yet</p>
              )}
            </div>
            {interviewDetail?.candidate?.experience_summary && (
              <p className="text-xs text-white/35 leading-relaxed italic pt-2 border-t border-white/5">
                {interviewDetail.candidate.experience_summary}
              </p>
            )}
          </motion.div>

          {/* Live Transcript */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-card p-6 rounded-3xl flex-1 overflow-hidden flex flex-col max-h-[420px]"
          >
            <h4 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-4">Live Transcript</h4>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {status === 'connected' && messages.length === 0 && (
                <div className="flex items-center justify-center gap-2 text-blue-400/40 py-8">
                  <div className="w-4 h-4 border-2 border-blue-400/20 border-t-blue-400 rounded-full animate-spin" />
                  <span className="text-xs">Waiting for AI interviewer...</span>
                </div>
              )}
              {messages.map((msg, i) => {
                if (msg.error) return (
                  <div key={i} className="flex items-start gap-2 text-red-400 bg-red-500/10 border border-red-500/15 p-3 rounded-2xl">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <p className="text-xs leading-relaxed">{msg.error}</p>
                  </div>
                );
                if (msg.transcript) return (
                  <div key={i} className="space-y-2">
                    {/* User message */}
                    <div className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5">
                        <User className="w-3 h-3 text-emerald-400" />
                      </div>
                      <p className="text-xs text-white/70 bg-emerald-500/5 border border-emerald-500/10 p-3 rounded-2xl rounded-tl-none leading-relaxed">
                        {msg.transcript}
                      </p>
                    </div>
                    {/* AI Insight */}
                    {msg.evaluation && (
                      <div className="ml-7 space-y-1.5 border-l border-white/5 pl-3">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="w-3 h-3 text-blue-400" />
                          <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">AI Insight</p>
                        </div>
                        <div className="text-[11px] text-white/50 bg-white/[0.03] border border-white/5 p-2.5 rounded-xl">
                          {typeof msg.evaluation === 'object' && (
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-blue-400/80 font-medium">Accuracy:</span>
                              <div className="flex gap-0.5">
                                {[...Array(10)].map((_, j) => (
                                  <div key={j} className={`w-1.5 h-1.5 rounded-full ${j < (msg.evaluation as any).technical_accuracy ? 'bg-blue-400' : 'bg-white/10'}`} />
                                ))}
                              </div>
                              <span className="text-blue-400/60 text-[10px]">{(msg.evaluation as any).technical_accuracy}/10</span>
                            </div>
                          )}
                          <p className="line-clamp-2 italic text-white/40">
                            &ldquo;{typeof msg.evaluation === 'object' ? msg.evaluation.feedback : msg.evaluation}&rdquo;
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
                return null;
              })}
              {latestMsg?.status === 'completed' && (
                <div className="mt-4 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center space-y-3">
                  <Check className="w-8 h-8 text-emerald-400 mx-auto" />
                  <h5 className="font-bold text-emerald-400 text-sm">Interview Complete!</h5>
                  <button
                    onClick={handleDownloadReport}
                    disabled={isDownloading}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDownloading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        Download Report
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default InterviewSession;
