import { useState, useCallback, useRef, useEffect } from 'react';
import { authFetch, getAuthHeaders } from '@/lib/auth-fetch';
import { api } from '@/api/client';
import { consumeSseStream } from '../lib/sse-stream.js';
import type { SseToolResultEvent, SseToolCallStartEvent } from '../lib/sse-stream.js';
import type { AiMessage } from '@/api/generated/Api';

export interface AiMessageData {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  tool_result?: unknown;
  visualization_type?: string | null;
  isStreaming?: boolean;
  isPendingTool?: boolean;
  sequence?: number;
}

interface AiChatState {
  messages: AiMessageData[];
  conversationId: string | null;
  isShared: boolean;
  ownerName: string | null;
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

/** Shared SSE streaming logic used by both sendMessage and editMessage. */
async function streamChat(
  body: Record<string, unknown>,
  abortRef: React.MutableRefObject<AbortController | null>,
  setState: React.Dispatch<React.SetStateAction<AiChatState>>,
) {
  const abortController = new AbortController();
  abortRef.current = abortController;

  const res = await authFetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: abortController.signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error((err as { message?: string }).message || `HTTP ${res.status}`);
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
    onToolCallStart(event: SseToolCallStartEvent) {
      assistantId = tempId();
      assistantContent = '';
      const pendingId = event.tool_call_id;
      setState((prev) => ({
        ...prev,
        messages: [
          ...prev.messages,
          {
            id: pendingId,
            role: 'tool',
            content: null,
            tool_call_id: event.tool_call_id,
            tool_name: event.name,
            tool_args: event.args,
            tool_result: null,
            visualization_type: null,
            isPendingTool: true,
          },
        ],
      }));
    },
    onToolResult(event: SseToolResultEvent) {
      setState((prev) => ({
        ...prev,
        messages: prev.messages.map((m) =>
          m.tool_call_id === event.tool_call_id && m.isPendingTool
            ? {
                ...m,
                tool_result: event.result,
                visualization_type: event.visualization_type,
                isPendingTool: false,
              }
            : m,
        ),
      }));
    },
    onError(message) {
      setState((prev) => ({ ...prev, error: message }));
    },
  });
}

export function useAiChat(projectId: string) {
  const [state, setState] = useState<AiChatState>({
    messages: [],
    conversationId: null,
    isShared: false,
    ownerName: null,
    isStreaming: false,
    error: null,
    hasMore: false,
    isLoadingMore: false,
  });

  const abortRef = useRef<AbortController | null>(null);
  const oldestSequenceRef = useRef<number | undefined>(undefined);
  const conversationIdRef = useRef<string | null>(null);
  const isLoadingMoreRef = useRef(false);
  const hasMoreRef = useRef(false);

  // Keep a ref in sync so sendMessage/editMessage can read it without stale closures
  useEffect(() => {
    conversationIdRef.current = state.conversationId;
  }, [state.conversationId]);

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

      try {
        await streamChat(
          {
            project_id: projectId,
            conversation_id: conversationId ?? conversationIdRef.current,
            message: text,
          },
          abortRef,
          setState,
        );

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
    [],
  );

  const editMessage = useCallback(
    async (sequence: number, newText: string, projectId: string) => {
      if (!getAuthHeaders().Authorization) return;

      const convId = conversationIdRef.current;
      if (!convId) return;

      // Optimistically update: replace edited message content and drop all following messages
      setState((prev) => ({
        ...prev,
        messages: prev.messages
          .filter((m) => m.sequence === undefined || m.sequence <= sequence)
          .map((m) =>
            m.sequence === sequence ? { ...m, content: newText } : m,
          ),
        isStreaming: true,
        error: null,
      }));

      try {
        await streamChat(
          {
            project_id: projectId,
            conversation_id: convId,
            message: newText,
            edit_sequence: sequence,
          },
          abortRef,
          setState,
        );

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
    [],
  );

  const loadConversation = useCallback(async (convId: string) => {
    try {
      const data = await api.aiControllerGetConversation({ id: convId, limit: PAGE_SIZE, project_id: projectId });

      hasMoreRef.current = data.has_more ?? false;
      setState({
        messages: mapMessages(data.messages ?? []),
        conversationId: convId,
        isShared: data.is_shared ?? false,
        ownerName: data.owner_name ?? null,
        isStreaming: false,
        error: null,
        hasMore: data.has_more ?? false,
        isLoadingMore: false,
      });
    } catch (err: unknown) {
      setState((prev) => ({ ...prev, error: err instanceof Error ? err.message : 'Failed to load conversation' }));
    }
  }, [projectId]);

  // Keep refs in sync without causing callback rebuilds
  useEffect(() => {
    oldestSequenceRef.current = state.messages[0]?.sequence;
  }, [state.messages]);

  useEffect(() => {
    hasMoreRef.current = state.hasMore;
  }, [state.hasMore]);

  const loadMoreMessages = useCallback(async () => {
    const convId = conversationIdRef.current;
    if (!convId || isLoadingMoreRef.current || !hasMoreRef.current) return;

    const oldestSeq = oldestSequenceRef.current;
    if (!oldestSeq) return;

    isLoadingMoreRef.current = true;
    setState((prev) => ({ ...prev, isLoadingMore: true }));

    try {
      const data = await api.aiControllerGetConversation({
        id: convId,
        limit: PAGE_SIZE,
        before_sequence: oldestSeq,
        project_id: projectId,
      });

      const older = mapMessages(data.messages ?? []);
      hasMoreRef.current = data.has_more ?? false;
      setState((prev) => ({
        ...prev,
        messages: [...older, ...prev.messages],
        hasMore: data.has_more ?? false,
        isLoadingMore: false,
      }));
    } catch (err: unknown) {
      setState((prev) => ({ ...prev, isLoadingMore: false, error: err instanceof Error ? err.message : 'Failed to load messages' }));
    } finally {
      isLoadingMoreRef.current = false;
    }
  }, [projectId]);

  const startNewConversation = useCallback(() => {
    abortRef.current?.abort();
    setState({
      messages: [],
      conversationId: null,
      isShared: false,
      ownerName: null,
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

  const setIsShared = useCallback((isShared: boolean) => {
    setState((prev) => ({ ...prev, isShared }));
  }, []);

  return {
    messages: state.messages,
    conversationId: state.conversationId,
    isShared: state.isShared,
    ownerName: state.ownerName,
    isStreaming: state.isStreaming,
    error: state.error,
    hasMore: state.hasMore,
    isLoadingMore: state.isLoadingMore,
    sendMessage,
    editMessage,
    loadConversation,
    loadMoreMessages,
    startNewConversation,
    stopStreaming,
    setIsShared,
  };
}
