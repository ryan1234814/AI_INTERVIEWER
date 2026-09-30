import { useState, useEffect, useRef, useCallback } from 'react';

interface Message {
  transcript?: string;
  next_question?: string;
  evaluation?: any;
  behavioral?: any;
  error?: string;
  status?: string;
  type?: string;
  event_type?: string;
  is_warning?: boolean;
}

export const useWebSocket = (interviewId: string) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [messages, setMessages] = useState<Message[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      // Don't reconnect if the interview is already completed
      if (completedRef.current) {
        console.log('[WebSocket] Interview completed, not reconnecting');
        return;
      }

      // Determine the backend origin for the WebSocket.
      // Priority: explicit VITE_WS_URL > VITE_API_URL > local dev (:8000) > same host.
      // Vercel cannot proxy WebSockets, so prod must connect directly to Render.
      const envWs = import.meta.env.VITE_WS_URL;
      const envApi = import.meta.env.VITE_API_URL;
      const isLocal =
        window.location.host.includes('localhost') || window.location.host.includes('127.0.0.1');

      let wsBase: string;
      if (envWs) {
        wsBase = envWs.replace(/\/$/, '').replace(/^http/, 'ws');
      } else if (envApi) {
        wsBase = envApi.replace(/\/$/, '').replace(/^http/, 'ws');
      } else if (isLocal) {
        wsBase = 'ws://localhost:8000';
      } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsBase = `${protocol}//${window.location.host}`;
      }

      const wsUrl = `${wsBase}/ws/interview/${interviewId}`;
      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        setStatus('connected');
        console.log(`[WebSocket] Connected to ${socket.url}`);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.error) {
            console.error(`[WebSocket] Server reported error: ${data.error}`);
          }
          // Detect completion — prevent future reconnects
          if (data.status === 'completed') {
            completedRef.current = true;
            console.log('[WebSocket] Interview completed, marking to prevent reconnect');
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
        // Only reconnect if the interview is NOT completed
        if (!completedRef.current) {
          reconnectTimer = setTimeout(connect, 3000);
        }
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

  const sendText = useCallback((text: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'text', content: text }));
    }
  }, []);

  // Send audio binary data for server-side Groq Whisper STT
  const sendAudio = useCallback((audioBlob: Blob) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      audioBlob.arrayBuffer().then((buffer) => {
        socketRef.current?.send(buffer);
        console.log(`[WebSocket] Sent ${buffer.byteLength} bytes of audio`);
      });
    }
  }, []);

  return { status, messages, sendText, sendAudio };
};
