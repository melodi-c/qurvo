import { useState, useCallback, useRef, useEffect } from 'react';
import { authFetch, getAuthHeaders } from '@/lib/auth-fetch';
import { api } from '@/api/client';
import { consumeSseStream } from '../lib/sse-stream.js';
import type { SseToolResultEvent } from '../lib/sse-stream.js';
import type { AiMessage } from '@/api/generated/Api';

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

const PAGE_SIZE = 30;

let nextId = 0;
function tempId(): string {
  return `temp-${++nextId}`;
}

function mapMessages(raw: AiMessage[]): AiMessageData[] {
  return raw.map((m) => ({
    id: m.id,
    role: m.role as AiMessageData['role'],
    content: m.content ?? null,
    tool_call_id: m.tool_call_id ?? undefined,
    tool_name: m.tool_name ?? undefined,
    tool_result: m.tool_result,
    visualization_type: m.visualization_type,
    sequence: m.sequence,
  }));
}

function upsertAssistantMessage(
  messages: AiMessageData[],
  id: string,
  content: string,
): AiMessageData[] {
  const msgs = [...messages];
  const existingIdx = msgs.findIndex((m) => m.id === id);
  const assistantMsg: AiMessageData = {
    id,
    role: 'assistant',
    content,
    isStreaming: true,
  };
  if (existingIdx >= 0) {
    msgs[existingIdx] = assistantMsg;
  } else {
    msgs.push(assistantMsg);
  }
  return msgs;
}

function finalizeStreamingMessages(messages: AiMessageData[]): AiMessageData[] {
  return messages.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m));
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
  const oldestSequenceRef = useRef<number | undefined>(undefined);

  const sendMessage = useCallback(
    async (text: string, projectId: string, conversationId?: string | null) => {
      if (!getAuthHeaders().Authorization) return;

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
        const res = await authFetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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

        let assistantId = tempId();
        let assistantContent = '';

        await consumeSseStream(res, {
          onConversation(id) {
            setState((prev) => ({ ...prev, conversationId: id }));
          },
          onTextDelta(content) {
            assistantContent += content;
            const currentContent = assistantContent;
            const currentId = assistantId;
            setState((prev) => ({
              ...prev,
              messages: upsertAssistantMessage(prev.messages, currentId, currentContent),
            }));
          },
          onToolCallStart() {
            assistantId = tempId();
            assistantContent = '';
          },
          onToolResult(event: SseToolResultEvent) {
            setState((prev) => ({
              ...prev,
              messages: [
                ...prev.messages,
                {
                  id: tempId(),
                  role: 'tool',
                  content: null,
                  tool_call_id: event.tool_call_id,
                  tool_name: event.name,
                  tool_result: event.result,
                  visualization_type: event.visualization_type,
                },
              ],
            }));
          },
          onError(message) {
            setState((prev) => ({ ...prev, error: message }));
          },
        });

        setState((prev) => ({
          ...prev,
          isStreaming: false,
          messages: finalizeStreamingMessages(prev.messages),
        }));
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        }));
      }
    },
    [state.conversationId],
  );

  const loadConversation = useCallback(async (convId: string) => {
    try {
      const data = await api.aiControllerGetConversation({ id: convId, limit: PAGE_SIZE });

      setState({
        messages: mapMessages(data.messages ?? []),
        conversationId: convId,
        isStreaming: false,
        error: null,
        hasMore: data.has_more ?? false,
        isLoadingMore: false,
      });
    } catch (err: unknown) {
      setState((prev) => ({ ...prev, error: err instanceof Error ? err.message : 'Failed to load conversation' }));
    }
  }, []);

  // Keep oldest sequence ref in sync without causing callback rebuilds
  useEffect(() => {
    oldestSequenceRef.current = state.messages[0]?.sequence;
  }, [state.messages]);

  const loadMoreMessages = useCallback(async () => {
    if (!state.conversationId || state.isLoadingMore || !state.hasMore) return;

    const oldestSeq = oldestSequenceRef.current;
    if (!oldestSeq) return;

    setState((prev) => ({ ...prev, isLoadingMore: true }));

    try {
      const data = await api.aiControllerGetConversation({
        id: state.conversationId!,
        limit: PAGE_SIZE,
        before_sequence: oldestSeq,
      });

      const older = mapMessages(data.messages ?? []);
      setState((prev) => ({
        ...prev,
        messages: [...older, ...prev.messages],
        hasMore: data.has_more ?? false,
        isLoadingMore: false,
      }));
    } catch (err: unknown) {
      setState((prev) => ({ ...prev, isLoadingMore: false, error: err instanceof Error ? err.message : 'Failed to load messages' }));
    }
  }, [state.conversationId, state.isLoadingMore, state.hasMore]);

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
      messages: finalizeStreamingMessages(prev.messages),
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
