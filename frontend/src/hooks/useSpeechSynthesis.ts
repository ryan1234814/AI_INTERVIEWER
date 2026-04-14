import { useState, useCallback, useRef } from 'react';

interface SpeechOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  voice?: SpeechSynthesisVoice;
}

export const useSpeechSynthesis = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Get available voices
  const loadVoices = useCallback(() => {
    const availableVoices = window.speechSynthesis.getVoices();
    // Prefer English voices
    const englishVoices = availableVoices.filter(v => v.lang.startsWith('en'));
    setVoices(englishVoices.length > 0 ? englishVoices : availableVoices);
    return availableVoices;
  }, []);

  // Speak text using browser's built-in TTS
  const speak = useCallback((text: string, options: SpeechOptions = {}): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!window.speechSynthesis) {
        reject(new Error('Speech synthesis not supported'));
        return;
      }

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utteranceRef.current = utterance;

      // Default options optimized for interview questions
      utterance.rate = options.rate ?? 1.0;
      utterance.pitch = options.pitch ?? 1.0;
      utterance.volume = options.volume ?? 1.0;

      // Use first available English voice or default
      if (options.voice) {
        utterance.voice = options.voice;
      } else {
        const voices = window.speechSynthesis.getVoices();
        const enVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) ||
                         voices.find(v => v.lang.startsWith('en')) ||
                         voices[0];
        if (enVoice) utterance.voice = enVoice;
      }

      utterance.onstart = () => {
        console.log('[TTS] Speaking:', text.substring(0, 50) + '...');
        setIsSpeaking(true);
      };

      utterance.onend = () => {
        console.log('[TTS] Finished speaking');
        setIsSpeaking(false);
        utteranceRef.current = null;
        resolve();
      };

      utterance.onerror = (event) => {
        console.error('[TTS] Error:', event.error);
        setIsSpeaking(false);
        utteranceRef.current = null;
        // Don't reject on error - some browsers report errors even when working
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  }, []);

  // Stop speaking
  const stop = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    utteranceRef.current = null;
  }, []);

  // Check if supported
  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  return {
    speak,
    stop,
    isSpeaking,
    voices,
    loadVoices,
    isSupported
  };
};
