import { useState, useEffect, useCallback } from 'react';
import { sendChatMessage, ChatChunk, safeListen } from '../lib/tauri';

export interface LocalChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export function useChat() {
  const [messages, setMessages] = useState<LocalChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    const unlisten = safeListen<ChatChunk>('chat-chunk', (event) => {
      const { message, done } = event.payload;

      if (message) {
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === 'assistant' && lastMsg.id === 'current-stream') {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1] = {
              ...lastMsg,
              content: lastMsg.content + message.content,
            };
            return newMessages;
          } else {
            return [
              ...prev,
              {
                id: 'current-stream',
                role: 'assistant',
                content: message.content,
                timestamp: new Date().toISOString(),
              },
            ];
          }
        });
      }

      if (done) {
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.id === 'current-stream') {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1] = {
              ...lastMsg,
              id: `assistant-${Date.now()}`,
            };
            return newMessages;
          }
          return prev;
        });
        setIsStreaming(false);
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    const tempId = `user-${Date.now()}`;
    const userMsg: LocalChatMessage = {
      id: tempId,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);

    try {
      await sendChatMessage(content);
    } catch (err) {
      console.error('Failed to send chat message:', err);
      setIsStreaming(false);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, sendMessage, isStreaming, clearMessages };
}
