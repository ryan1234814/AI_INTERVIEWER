import { useState, useEffect, useRef, useCallback } from 'react';

interface Message {
  transcript?: string;
  next_question?: string;
  evaluation?: any;
  error?: string;
  status?: string;
  audioBlob?: Blob;
}

export const useWebSocket = (interviewId: string) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [messages, setMessages] = useState<Message[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const pendingAudioRef = useRef<Blob | null>(null);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const socket = new WebSocket(`${protocol}//${host}/ws/interview/${interviewId}`);
      socket.binaryType = 'blob';

      socket.onopen = () => {
        setStatus('connected');
        console.log(`[WebSocket] Connected to ${socket.url}`);
      };

      socket.onmessage = (event) => {
        // Handle binary audio data separately
        if (event.data instanceof Blob) {
          console.log(`[WebSocket] Received audio blob: ${event.data.size} bytes`);
          pendingAudioRef.current = event.data;
          return;
        }

        try {
          const data = JSON.parse(event.data);
          if (data.error) {
            console.error(`[WebSocket] Server reported error: ${data.error}`);
          }

          // Attach pending audio blob to this question message
          if (data.next_question && pendingAudioRef.current) {
            data.audioBlob = pendingAudioRef.current;
            pendingAudioRef.current = null;
          }

          setMessages((prev) => [...prev, data]);
        } catch (err) {
          console.error(`[WebSocket] Failed to parse message:`, err);
        }
      };

      socket.onerror = (error) => {
        console.error('[WebSocket] Connection Error:', error);
      };

      socket.onclose = (event) => {
        console.warn(`[WebSocket] Closed. Code: ${event.code}, Reason: ${event.reason}`);
        setStatus('disconnected');
        reconnectTimer = setTimeout(connect, 3000);
      };

      socketRef.current = socket;
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close();
      }
    };
  }, [interviewId]);

  const sendAudio = useCallback((audioBlob: Blob) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      audioBlob.arrayBuffer().then((buffer) => {
        socketRef.current?.send(buffer);
      });
    }
  }, []);

  const sendText = useCallback((text: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'text', content: text }));
    }
  }, []);

  const playAudio = useCallback((blob: Blob) => {
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    audio.play().catch(error => {
      console.error('[TTS] Playback failed:', error);
    });
    audio.onended = () => URL.revokeObjectURL(audioUrl);
  }, []);

  return { status, messages, sendAudio, sendText, playAudio };
};
