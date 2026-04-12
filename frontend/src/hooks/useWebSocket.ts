import { useState, useEffect, useRef, useCallback } from 'react';

export const useWebSocket = (interviewId: string) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [messages, setMessages] = useState<any[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let reconnectTimer: NodeJS.Timeout;
    
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
        console.log(`[WebSocket] Message received:`, event.data);
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
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
        reconnectTimer = setTimeout(connect, 3000); // Auto reconnect
      };

      socketRef.current = socket;
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (socketRef.current) {
        socketRef.current.onclose = null; // Prevent reconnect on unmount
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

  return { status, messages, sendAudio, sendText };
};
