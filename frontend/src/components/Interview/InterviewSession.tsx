import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Send, MessageSquare, Shield, AlertCircle, Loader2, Sparkles, Volume2 } from 'lucide-react';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useSpeechSynthesis } from '../../hooks/useSpeechSynthesis';
import { getInterview, downloadReport } from '../../services/api';

interface Props {
  interviewId: string;
}

const InterviewSession: React.FC<Props> = ({ interviewId }) => {
  const { status, messages, sendText } = useWebSocket(interviewId);
  const { speak, stop, isSpeaking, isSupported } = useSpeechSynthesis();
  const [isRecording, setIsRecording] = useState(false);
  const [interviewDetail, setInterviewDetail] = useState<any>(null);
  const [textMode, setTextMode] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

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

  const recognitionRef = useRef<any>(null);
  const isRecordingRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    let silenceTimer: ReturnType<typeof setTimeout>;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        clearTimeout(silenceTimer);
        // Shorter silence timeout - 5 seconds instead of 15
        silenceTimer = setTimeout(() => {
          console.log("[STT] 5s Silence detected. Finalizing...");
          recognition.stop();
        }, 5000);

        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
           const transcript = finalTranscript.trim();
           console.log("[STT] Final Transcript:", transcript);
           sendText(transcript);

           if (transcript.toLowerCase().includes("thank you") || transcript.toLowerCase().includes("thanks")) {
              recognition.stop();
              setIsRecording(false);
              isRecordingRef.current = false;
           }
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          alert('Microphone access denied.');
          setTextMode(true);
          setIsRecording(false);
          isRecordingRef.current = false;
        } else if (event.error === 'no-speech' || event.error === 'aborted' || event.error === 'network') {
          // Auto-restart on recoverable errors
          console.log('[STT] Recoverable error, restarting...');
          setTimeout(() => {
            if (isRecordingRef.current) {
              try {
                recognition.start();
                console.log('[STT] Restarted after error');
              } catch (e) {
                console.log('[STT] Restart failed after error');
                setIsRecording(false);
                isRecordingRef.current = false;
              }
            }
          }, 300);
        }
      };

      recognition.onend = () => {
        console.log('[STT] Recognition ended, isRecording=', isRecordingRef.current);
        // Auto-restart if still recording (use ref to avoid stale closure)
        if (isRecordingRef.current) {
          setTimeout(() => {
            try {
              recognition.start();
              console.log('[STT] Auto-restarted');
            } catch (e) {
              console.log('[STT] Could not auto-restart');
              setIsRecording(false);
              isRecordingRef.current = false;
            }
          }, 200);
        }
      };

      recognitionRef.current = recognition;
    }
    return () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    };
  }, [sendText]);

  const startRecording = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
        isRecordingRef.current = true;
      } catch (e) {
        console.error("Recognition start error:", e);
      }
    } else {
      alert("Speech recognition not supported in this browser.");
      setTextMode(true);
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
      isRecordingRef.current = false;
    }
  };

  const handleSendMessage = () => {
    if (!textInput.trim() || status !== 'connected') return;
    const input = textInput;
    setTextInput('');
    sendText(input);
  };

  // Speak questions using browser's built-in TTS when new question arrives
  useEffect(() => {
    const latestMessage = messages[messages.length - 1];
    if (latestMessage?.next_question && isSupported) {
      console.log(`[TTS] Speaking question: ${latestMessage.next_question.substring(0, 50)}...`);
      speak(latestMessage.next_question).catch((err) => {
        console.error('[TTS] Speech synthesis error:', err);
      });
    }
  }, [messages, speak, isSupported]);

  const latestMsg = messages[messages.length - 1];
  const currentQuestion = latestMsg?.next_question || interviewDetail?.responses?.[0]?.question_text || "Please introduce yourself and tell me about your background.";

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

              <div className="h-24 flex items-center justify-center">
                {isRecording && (
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
                )}
                {!isRecording && !textMode && !isSpeaking && (
                  <p className="text-white/20 text-sm font-light italic">Hold the mic button to answer</p>
                )}
              </div>
            </div>

            {/* Interaction Footer */}
            <div className="mt-auto pt-8">
              {textMode ? (
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Type your response..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-blue-500 transition-all"
                  />
                  <button
                    onClick={handleSendMessage}
                    className="p-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-lg shadow-blue-500/20"
                  >
                    <Send className="w-6 h-6" />
                  </button>
                </div>
              ) : (
                <div className="flex justify-center">
                  <button
                    onMouseDown={startRecording}
                    onMouseUp={stopRecording}
                    onTouchStart={startRecording}
                    onTouchEnd={stopRecording}
                    className={`group relative w-24 h-24 rounded-full flex items-center justify-center transition-all ${
                      isRecording
                      ? 'bg-red-500 scale-110 shadow-[0_0_50px_rgba(239,68,68,0.4)]'
                      : 'bg-blue-600 hover:bg-blue-500 hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(37,99,235,0.3)]'
                    }`}
                  >
                    {isRecording ? <MicOff className="w-8 h-8 text-white" /> : <Mic className="w-8 h-8 text-white" />}
                    <div className="absolute -inset-4 rounded-full border border-white/5 animate-ping opacity-20 pointer-events-none" />
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
                {interviewDetail?.candidate?.extracted_skills?.map((skill: string, i: number) => (
                  <span key={i} className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-[10px] font-medium text-white/70">
                    {skill}
                  </span>
                ))}
              </div>
              <p className="text-xs text-white/40 leading-relaxed italic">
                {interviewDetail?.candidate?.experience_summary}
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
