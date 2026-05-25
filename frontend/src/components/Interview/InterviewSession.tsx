import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Send, MessageSquare, Shield, AlertCircle, Loader2, Sparkles, Volume2 } from 'lucide-react';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useSpeechSynthesis } from '../../hooks/useSpeechSynthesis';
import { getInterview, downloadReport } from '../../services/api';

interface Props {
  interviewId: string;
}

const InterviewSession: React.FC<Props> = ({ interviewId }) => {
  const { status, messages, sendText, sendAudio } = useWebSocket(interviewId);
  const { speak, stop, isSpeaking, isSupported } = useSpeechSynthesis();
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
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Session Header */}
      <div className="glass-card p-6 rounded-[2rem] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/20 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h3 className="font-bold text-lg">{interviewDetail?.job?.title || 'AI Interview'}</h3>
            <p className="text-white/40 text-sm flex items-center gap-1">
              <Shield className="w-3 h-3" /> Secure AI Session
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${status === 'connected' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            {status.toUpperCase()}
          </div>
          <button
            onClick={() => setTextMode(!textMode)}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 transition-colors"
          >
            {textMode ? <Mic className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Interaction Area */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card p-8 rounded-[2.5rem] relative overflow-hidden min-h-[400px] flex flex-col">
            <div className="flex-1 space-y-8">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Interviewer Question</span>
                  {isSpeaking && (
                    <div className="flex items-center gap-1">
                      <Volume2 className="w-3 h-3 text-emerald-400" />
                      <span className="text-[10px] text-emerald-400 font-bold">Speaking</span>
                      <div className="flex items-end gap-0.5 h-3">
                        {[...Array(3)].map((_, i) => (
                          <div
                            key={i}
                            className="w-0.5 bg-emerald-400 rounded-full animate-pulse"
                            style={{ height: `${6 + i * 3}px`, animationDelay: `${i * 0.15}s` }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-2xl font-medium leading-relaxed">
                  {currentQuestion}
                </p>
              </div>

              <div className="h-28 flex flex-col items-center justify-center gap-2">
                {isRecording && (
                  <>
                    <div className="flex items-end gap-1.5 h-12">
                      {[...Array(12)].map((_, i) => (
                        <motion.div
                          key={i}
                          animate={{ height: [10, 40, 15, 30, 10] }}
                          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.1 }}
                          className="w-1.5 bg-blue-500 rounded-full"
                        />
                      ))}
                    </div>
                    {/* Live interim transcription feedback */}
                    {interimText && (
                      <p className="text-white/40 text-xs italic text-center max-w-md truncate">
                        🎤 {interimText}
                      </p>
                    )}
                    {transcriptBufferRef.current && !interimText && (
                      <p className="text-emerald-400/60 text-xs italic text-center max-w-md truncate">
                        ✓ {transcriptBufferRef.current.substring(0, 80)}...
                      </p>
                    )}
                    {!interimText && !transcriptBufferRef.current && (
                      <p className="text-white/20 text-xs italic">Listening for your answer...</p>
                    )}
                  </>
                )}
                {isProcessing && (
                  <div className="flex items-center gap-2 text-blue-400/60">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Processing your answer...</span>
                  </div>
                )}
                {!isRecording && !isProcessing && !textMode && isSpeaking && (
                  <p className="text-white/30 text-sm font-light italic">AI is speaking — mic will auto-start when done</p>
                )}
                {!isRecording && !isProcessing && !textMode && !isSpeaking && (
                  <p className="text-white/20 text-sm font-light italic">Click the mic button to start answering</p>
                )}
              </div>
            </div>

            {/* Interaction Footer */}
            <div className="mt-auto pt-8">
              {isCompleted ? (
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium">
                    <Sparkles className="w-4 h-4" />
                    Interview Complete
                  </div>
                  <div>
                    <button
                      onClick={handleDownloadReport}
                      disabled={isDownloading}
                      className="px-8 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Generating Report...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5" />
                          Download PDF Report
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
                    placeholder="Type your response..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-blue-500 transition-all"
                    disabled={isProcessing}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={isProcessing}
                    className="p-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
                  >
                    {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
                  </button>
                </div>
              ) : (
                <div className="flex justify-center">
                  <button
                    onClick={toggleRecording}
                    disabled={isSpeaking || isProcessing}
                    className={`group relative w-24 h-24 rounded-full flex items-center justify-center transition-all ${
                      isSpeaking || isProcessing
                      ? 'bg-gray-600 cursor-not-allowed opacity-50'
                      : isRecording
                      ? 'bg-red-500 scale-110 shadow-[0_0_50px_rgba(239,68,68,0.4)]'
                      : 'bg-blue-600 hover:bg-blue-500 hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(37,99,235,0.3)]'
                    }`}
                  >
                    {isRecording ? <MicOff className="w-8 h-8 text-white" /> : <Mic className="w-8 h-8 text-white" />}
                    {!isSpeaking && !isProcessing && (
                      <div className="absolute -inset-4 rounded-full border border-white/5 animate-ping opacity-20 pointer-events-none" />
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          <div className="glass-card p-6 rounded-[2rem] space-y-4">
            <h4 className="text-sm font-bold text-white/40 uppercase tracking-widest">Candidate Resume</h4>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {Array.isArray(interviewDetail?.candidate?.extracted_skills) ? (
                  interviewDetail.candidate.extracted_skills.map((skill: string, i: number) => (
                    <span key={i} className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-[10px] font-medium text-white/70">
                      {skill}
                    </span>
                  ))
                ) : typeof interviewDetail?.candidate?.extracted_skills === 'string' ? (
                  (interviewDetail.candidate.extracted_skills as string).split(',').map((skill: string, i: number) => (
                    <span key={i} className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-[10px] font-medium text-white/70">
                      {skill.trim()}
                    </span>
                  ))
                ) : null}
              </div>
              <p className="text-xs text-white/40 leading-relaxed italic">
                {interviewDetail?.candidate?.experience_summary || 'No resume summary available.'}
              </p>
            </div>
          </div>

          <div className="glass-card p-6 rounded-[2rem] flex-1 overflow-hidden flex flex-col max-h-[400px]">
            <h4 className="text-sm font-bold text-white/40 uppercase tracking-widest mb-4">Live Transcript</h4>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {status === 'connected' && messages.length === 0 && (
                <div className="flex items-center justify-center gap-2 text-blue-400/60 py-8">
                  <div className="w-5 h-5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                  <span className="text-sm">Waiting for AI interviewer...</span>
                </div>
              )}
              {messages.map((msg, i) => {
                if (msg.error) return (
                  <div key={i} className="flex items-start gap-2 text-red-400 bg-red-500/10 border border-red-500/20 p-3 rounded-2xl">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <p className="text-xs">{msg.error}</p>
                  </div>
                );
                if (msg.transcript) return (
                  <div key={i} className="space-y-2">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-emerald-400">You</p>
                      <p className="text-xs text-white/70 bg-emerald-500/5 border border-emerald-500/10 p-3 rounded-2xl rounded-tl-none">
                        {msg.transcript}
                      </p>
                    </div>
                    {msg.evaluation && (
                      <div className="ml-4 space-y-1 border-l border-white/10 pl-3">
                        <p className="text-[10px] font-bold text-blue-400">AI Insight</p>
                        <div className="text-[11px] text-white/50 bg-white/5 p-2 rounded-xl">
                          <div className="flex gap-2 mb-1">
                            <span className="text-blue-400">Accuracy: {typeof msg.evaluation === 'object' ? msg.evaluation.technical_accuracy : '... '}/10</span>
                          </div>
                          <p className="line-clamp-2 italic">"{typeof msg.evaluation === 'object' ? msg.evaluation.feedback : msg.evaluation}"</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
                return null;
              })}
              {latestMsg?.status === 'completed' && (
                <div className="mt-4 p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-center space-y-4">
                  <h5 className="font-bold text-emerald-400">Interview Complete!</h5>
                  <button
                    onClick={handleDownloadReport}
                    disabled={isDownloading}
                    className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDownloading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        Download PDF Report
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
