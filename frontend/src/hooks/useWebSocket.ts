import { useState, useEffect, useRef, useCallback } from 'react';

interface Message {
  transcript?: string;
  next_question?: string;
  evaluation?: any;
  error?: string;
  status?: string;
}

export const useWebSocket = (interviewId: string) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [messages, setMessages] = useState<Message[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const socket = new WebSocket(`${protocol}//${host}/ws/interview/${interviewId}`);

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

  const sendText = useCallback((text: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'text', content: text }));
    }
  }, []);

  return { status, messages, sendText };
};
