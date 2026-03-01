import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sparkles, ArrowLeft, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useQueryClient } from '@tanstack/react-query';
import { useAiChat } from '@/features/ai/hooks/use-ai-chat';
import { useToggleSharedConversation, useAiQuota } from '@/features/ai/hooks/use-ai-conversations';
import translations from './index.translations';
import { AiChatPanel } from './ai-chat-panel';

export function AiChatView({ chatId, projectId }: { chatId: string | null; projectId: string }) {
  const { t } = useLocalTranslation(translations);
  const [, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const quota = useAiQuota(projectId);

  const isQuotaExceeded =
    quota.ai_messages_per_month !== null &&
    quota.ai_messages_per_month >= 0 &&
    quota.ai_messages_used >= quota.ai_messages_per_month;

  const {
    messages,
    conversationId,
    isShared,
    ownerName,
    isStreaming,
    error,
    hasMore,
    isLoadingMore,
    sendMessage,
    editMessage,
    loadConversation,
    loadMoreMessages,
    startNewConversation,
    stopStreaming,
    setIsShared,
  } = useAiChat(projectId);

  const toggleSharedMutation = useToggleSharedConversation(projectId, setIsShared);

  const loadedRef = useRef(false);
  useEffect(() => {
    if (chatId && !loadedRef.current) {
      loadedRef.current = true;
      void loadConversation(chatId);
    }
  }, [chatId, loadConversation]);

  // When conversationId changes (new conversation created via streaming), sync to URL
  useEffect(() => {
    if (conversationId) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('chat', conversationId);
          return next;
        },
        { replace: true },
      );
    }
  }, [conversationId, setSearchParams]);

  const handleSend = useCallback(
    async (text: string) => {
      await sendMessage(text, projectId);
      void qc.invalidateQueries({ queryKey: ['ai-conversations', projectId] });
      void qc.invalidateQueries({ queryKey: ['billing', projectId] });
    },
    [sendMessage, projectId, qc],
  );

  const handleEdit = useCallback(
    async (sequence: number, newText: string) => {
      await editMessage(sequence, newText, projectId);
      void qc.invalidateQueries({ queryKey: ['ai-conversations', projectId] });
      void qc.invalidateQueries({ queryKey: ['billing', projectId] });
    },
    [editMessage, projectId, qc],
  );

  const handleStop = useCallback(() => {
    stopStreaming();
    void qc.invalidateQueries({ queryKey: ['ai-conversations', projectId] });
  }, [stopStreaming, qc, projectId]);

  const goBack = useCallback(() => {
    startNewConversation();
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('chat');
        return next;
      },
    );
  }, [startNewConversation, setSearchParams]);

  const handleToggleShare = useCallback(() => {
    if (!conversationId) {return;}
    toggleSharedMutation.mutate({ id: conversationId, is_shared: !isShared });
  }, [conversationId, isShared, toggleSharedMutation]);

  // A conversation is read-only if it's shared AND the current user is not the owner
  // (ownerName is set only for shared conversations loaded by non-owners)
  const isReadOnly = !!ownerName;
  const isInputDisabled = isReadOnly || isQuotaExceeded;

  const quotaLabel = quota.ai_messages_per_month === null || quota.ai_messages_per_month < 0
    ? t('quotaUnlimited')
    : t('quotaUsed', { used: String(quota.ai_messages_used), limit: String(quota.ai_messages_per_month) });

  return (
    <div className="-m-4 lg:-m-6 flex flex-col h-[calc(100dvh-var(--topbar-height))] lg:h-screen">
      {/* Header */}
      <div className="h-[var(--topbar-height)] flex items-center gap-2 px-4 border-b border-border shrink-0">
        <Button variant="ghost" size="icon-xs" onClick={goBack} aria-label={t('back')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold truncate flex-1">
          {chatId ? t('chat') : t('newChatLabel')}
        </span>
        {/* Quota indicator */}
        {!isReadOnly && (
          <span className={`text-xs shrink-0 ${isQuotaExceeded ? 'text-destructive' : 'text-muted-foreground'}`}>
            {quotaLabel}
          </span>
        )}
        {/* Share toggle — only shown for own conversations */}
        {conversationId && !isReadOnly && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isShared ? 'secondary' : 'ghost'}
                size="icon-xs"
                onClick={handleToggleShare}
                disabled={toggleSharedMutation.isPending}
                aria-label={isShared ? t('unshareConversation') : t('shareConversation')}
              >
                <Share2 className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isShared ? t('unshareConversation') : t('shareConversation')}
            </TooltipContent>
          </Tooltip>
        )}
        {/* Read-only shared indicator */}
        {isReadOnly && ownerName && (
          <span className="text-xs text-muted-foreground shrink-0">
            {t('sharedBy', { name: ownerName })}
          </span>
        )}
      </div>

      {/* Chat panel */}
      <div className="flex-1 min-h-0">
        <AiChatPanel
          messages={messages}
          isStreaming={isStreaming}
          error={error}
          onSend={isInputDisabled ? undefined : handleSend}
          onStop={isInputDisabled ? undefined : handleStop}
          onEdit={isInputDisabled ? undefined : handleEdit}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          onLoadMore={loadMoreMessages}
          readOnly={isInputDisabled}
          readOnlyMessage={isQuotaExceeded ? t('quotaExceeded') : t('readOnly')}
        />
      </div>
    </div>
  );
}
