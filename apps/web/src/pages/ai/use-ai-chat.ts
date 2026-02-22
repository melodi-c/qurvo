import { useState, useCallback, useRef } from 'react';

export interface AiMessageData {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_name?: string;
  tool_result?: unknown;
  visualization_type?: string | null;
  isStreaming?: boolean;
}

interface AiChatState {
  messages: AiMessageData[];
  conversationId: string | null;
  isStreaming: boolean;
  error: string | null;
}

const API_URL = import.meta.env.VITE_API_URL || '';

let nextId = 0;
function tempId() {
  return `temp-${++nextId}`;
}

export function useAiChat() {
  const [state, setState] = useState<AiChatState>({
    messages: [],
    conversationId: null,
    isStreaming: false,
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (text: string, projectId: string, conversationId?: string | null) => {
      const token = localStorage.getItem('qurvo_token');
      if (!token) return;

      // Add user message optimistically
      const userMsg: AiMessageData = { id: tempId(), role: 'user', content: text };
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, userMsg],
        isStreaming: true,
        error: null,
      }));

      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        const res = await fetch(`${API_URL}/api/ai/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            project_id: projectId,
            conversation_id: conversationId ?? state.conversationId,
            message: text,
          }),
          signal: abortController.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: 'Request failed' }));
          throw new Error(err.message || `HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';
        let assistantId = tempId();
        let assistantContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const json = line.slice(6).trim();
            if (!json) continue;

            let chunk: any;
            try {
              chunk = JSON.parse(json);
            } catch {
              continue;
            }

            switch (chunk.type) {
              case 'conversation':
                setState((prev) => ({
                  ...prev,
                  conversationId: chunk.conversation_id,
                }));
                break;

              case 'text_delta':
                assistantContent += chunk.content;
                setState((prev) => {
                  const msgs = [...prev.messages];
                  const existingIdx = msgs.findIndex((m) => m.id === assistantId);
                  const assistantMsg: AiMessageData = {
                    id: assistantId,
                    role: 'assistant',
                    content: assistantContent,
                    isStreaming: true,
                  };
                  if (existingIdx >= 0) {
                    msgs[existingIdx] = assistantMsg;
                  } else {
                    msgs.push(assistantMsg);
                  }
                  return { ...prev, messages: msgs };
                });
                break;

              case 'tool_call_start':
                // Reset assistant id for next text segment after tool results
                assistantId = tempId();
                assistantContent = '';
                break;

              case 'tool_result':
                setState((prev) => ({
                  ...prev,
                  messages: [
                    ...prev.messages,
                    {
                      id: tempId(),
                      role: 'tool',
                      content: null,
                      tool_call_id: chunk.tool_call_id,
                      tool_name: chunk.name,
                      tool_result: chunk.result,
                      visualization_type: chunk.visualization_type,
                    },
                  ],
                }));
                break;

              case 'error':
                setState((prev) => ({ ...prev, error: chunk.message }));
                break;

              case 'done':
                break;
            }
          }
        }

        // Mark streaming complete
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          messages: prev.messages.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
        }));
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          error: err.message || 'Unknown error',
        }));
      }
    },
    [state.conversationId],
  );

  const loadConversation = useCallback(
    async (convId: string) => {
      const token = localStorage.getItem('qurvo_token');
      if (!token) return;

      try {
        const res = await fetch(`${API_URL}/api/ai/conversations/${convId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to load conversation');
        const data = await res.json();

        const messages: AiMessageData[] = (data.messages ?? []).map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          tool_call_id: m.tool_call_id,
          tool_name: m.tool_name,
          tool_result: m.tool_result,
          visualization_type: m.visualization_type,
        }));

        setState({
          messages,
          conversationId: convId,
          isStreaming: false,
          error: null,
        });
      } catch (err: any) {
        setState((prev) => ({ ...prev, error: err.message }));
      }
    },
    [],
  );

  const startNewConversation = useCallback(() => {
    abortRef.current?.abort();
    setState({
      messages: [],
      conversationId: null,
      isStreaming: false,
      error: null,
    });
  }, []);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setState((prev) => ({
      ...prev,
      isStreaming: false,
      messages: prev.messages.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
    }));
  }, []);

  return {
    messages: state.messages,
    conversationId: state.conversationId,
    isStreaming: state.isStreaming,
    error: state.error,
    sendMessage,
    loadConversation,
    startNewConversation,
    stopStreaming,
  };
}
