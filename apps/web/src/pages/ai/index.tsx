import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { AiChatPanel } from './ai-chat-panel';
import { AiConversationList } from './ai-conversation-list';
import { useAiChat } from './use-ai-chat';

export default function AiPage() {
  const [searchParams] = useSearchParams();
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

  const handleSend = useCallback(
    (text: string) => {
      sendMessage(text, projectId);
    },
    [sendMessage, projectId],
  );

  const handleSelectConversation = useCallback(
    (id: string) => {
      loadConversation(id);
    },
    [loadConversation],
  );

  const handleNewConversation = useCallback(() => {
    startNewConversation();
  }, [startNewConversation]);

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
