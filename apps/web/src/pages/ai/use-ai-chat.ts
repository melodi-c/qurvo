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
  sequence?: number;
}

interface AiChatState {
  messages: AiMessageData[];
  conversationId: string | null;
  isStreaming: boolean;
  error: string | null;
  hasMore: boolean;
  isLoadingMore: boolean;
}

const API_URL = import.meta.env.VITE_API_URL || '';
const PAGE_SIZE = 30;

let nextId = 0;
function tempId() {
  return `temp-${++nextId}`;
}

function mapMessages(raw: any[]): AiMessageData[] {
  return raw.map((m: any) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    tool_call_id: m.tool_call_id,
    tool_name: m.tool_name,
    tool_result: m.tool_result,
    visualization_type: m.visualization_type,
    sequence: m.sequence,
  }));
}

export function useAiChat() {
  const [state, setState] = useState<AiChatState>({
    messages: [],
    conversationId: null,
    isStreaming: false,
    error: null,
    hasMore: false,
    isLoadingMore: false,
  });

  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (text: string, projectId: string, conversationId?: string | null) => {
      const token = localStorage.getItem('qurvo_token');
      if (!token) return;

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

  const loadConversation = useCallback(async (convId: string) => {
    const token = localStorage.getItem('qurvo_token');
    if (!token) return;

    try {
      const res = await fetch(
        `${API_URL}/api/ai/conversations/${convId}?limit=${PAGE_SIZE}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error('Failed to load conversation');
      const data = await res.json();

      setState({
        messages: mapMessages(data.messages ?? []),
        conversationId: convId,
        isStreaming: false,
        error: null,
        hasMore: data.has_more ?? false,
        isLoadingMore: false,
      });
    } catch (err: any) {
      setState((prev) => ({ ...prev, error: err.message }));
    }
  }, []);

  const loadMoreMessages = useCallback(async () => {
    const token = localStorage.getItem('qurvo_token');
    if (!token || !state.conversationId || state.isLoadingMore || !state.hasMore) return;

    const oldest = state.messages[0];
    if (!oldest?.sequence) return;

    setState((prev) => ({ ...prev, isLoadingMore: true }));

    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        before_sequence: String(oldest.sequence),
      });
      const res = await fetch(
        `${API_URL}/api/ai/conversations/${state.conversationId}?${params}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error('Failed to load messages');
      const data = await res.json();

      const older = mapMessages(data.messages ?? []);
      setState((prev) => ({
        ...prev,
        messages: [...older, ...prev.messages],
        hasMore: data.has_more ?? false,
        isLoadingMore: false,
      }));
    } catch (err: any) {
      setState((prev) => ({ ...prev, isLoadingMore: false, error: err.message }));
    }
  }, [state.conversationId, state.isLoadingMore, state.hasMore, state.messages]);

  const startNewConversation = useCallback(() => {
    abortRef.current?.abort();
    setState({
      messages: [],
      conversationId: null,
      isStreaming: false,
      error: null,
      hasMore: false,
      isLoadingMore: false,
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
    hasMore: state.hasMore,
    isLoadingMore: state.isLoadingMore,
    sendMessage,
    loadConversation,
    loadMoreMessages,
    startNewConversation,
    stopStreaming,
  };
}
