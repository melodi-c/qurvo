import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { AiChatPanel } from './ai-chat-panel';
import { AiConversationList } from './ai-conversation-list';
import { useAiChat } from './use-ai-chat';

export default function AiPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const qc = useQueryClient();

  const {
    messages,
    conversationId,
    isStreaming,
    error,
    sendMessage,
    loadConversation,
    startNewConversation,
    stopStreaming,
  } = useAiChat();

  // Helper: update `chat` search param without losing other params
  const setChatParam = useCallback(
    (chatId: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (chatId) {
            next.set('chat', chatId);
          } else {
            next.delete('chat');
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // On mount: restore conversation from URL
  const loadedRef = useRef(false);
  useEffect(() => {
    const chatId = new URLSearchParams(window.location.search).get('chat');
    if (chatId && !loadedRef.current) {
      loadedRef.current = true;
      loadConversation(chatId);
    }
  }, [loadConversation]);

  // When conversationId changes (e.g. new conversation created via streaming), sync to URL
  useEffect(() => {
    if (conversationId) {
      setChatParam(conversationId);
    }
  }, [conversationId, setChatParam]);

  const handleSend = useCallback(
    (text: string) => {
      sendMessage(text, projectId);
    },
    [sendMessage, projectId],
  );

  const handleSelectConversation = useCallback(
    (id: string) => {
      loadConversation(id);
      setChatParam(id);
    },
    [loadConversation, setChatParam],
  );

  const handleNewConversation = useCallback(() => {
    startNewConversation();
    setChatParam(null);
  }, [startNewConversation, setChatParam]);

  // Refresh conversation list when streaming ends
  const handleStop = useCallback(() => {
    stopStreaming();
    qc.invalidateQueries({ queryKey: ['ai-conversations', projectId] });
  }, [stopStreaming, qc, projectId]);

  const handleSendWrapped = useCallback(
    (text: string) => {
      handleSend(text);
      // Invalidate after a short delay so new conversations appear in sidebar
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['ai-conversations', projectId] });
      }, 2000);
    },
    [handleSend, qc, projectId],
  );

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Select a project to use AI Assistant
      </div>
    );
  }

  return (
    <div className="-m-4 lg:-m-6 flex flex-col lg:flex-row h-[calc(100vh-44px)] lg:h-screen">
      {/* Sidebar */}
      <div className="hidden lg:flex flex-col w-[240px] border-r border-border bg-[#0f0f11] shrink-0">
        <div className="h-[44px] flex items-center gap-2 px-4 border-b border-border">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">AI Assistant</span>
        </div>
        <AiConversationList
          activeId={conversationId}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
        />
      </div>

      {/* Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        <AiChatPanel
          messages={messages}
          isStreaming={isStreaming}
          error={error}
          onSend={handleSendWrapped}
          onStop={handleStop}
        />
      </div>
    </div>
  );
}
