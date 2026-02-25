import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useProjectId } from '@/hooks/use-project-id';
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles, Plus, MessageSquare, ArrowLeft } from 'lucide-react';
import { ClickableListRow } from '@/components/ui/clickable-list-row';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useAiChat } from '@/features/ai/hooks/use-ai-chat';
import { useConversations, useDeleteConversation, useRenameConversation } from '@/features/ai/hooks/use-ai-conversations';
import translations from './index.translations';
import { AiChatPanel } from './ai-chat-panel';

export default function AiPage() {
  const { t } = useLocalTranslation(translations);
  const [searchParams] = useSearchParams();
  const projectId = useProjectId();
  const chatId = searchParams.get('chat');

  if (!projectId) {
    return <EmptyState icon={Sparkles} description={t('selectProject')} />;
  }

  if (chatId) {
    return <AiChatView chatId={chatId === 'new' ? null : chatId} projectId={projectId} />;
  }

  return <AiListView projectId={projectId} />;
}

/* ───────────────────── List View ───────────────────── */

function AiListView({ projectId }: { projectId: string }) {
  const { t } = useLocalTranslation(translations);
  const [, setSearchParams] = useSearchParams();
  const { data: conversations, isLoading } = useConversations(projectId);
  const deleteMutation = useDeleteConversation(projectId);
  const renameMutation = useRenameConversation(projectId);
  const { isOpen, itemId, itemName, requestDelete, close } = useConfirmDelete();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const navigate = useCallback(
    (chatParam: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('chat', chatParam);
        return next;
      });
    },
    [setSearchParams],
  );

  const startNew = useCallback(() => navigate('new'), [navigate]);

  const startEdit = useCallback((id: string, currentTitle: string) => {
    setEditingId(id);
    setEditValue(currentTitle);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditValue('');
  }, []);

  const commitEdit = useCallback(
    async (id: string) => {
      const trimmed = editValue.trim();
      if (!trimmed || trimmed.length > 200) {
        cancelEdit();
        return;
      }
      setEditingId(null);
      setEditValue('');
      await renameMutation.mutateAsync({ id, title: trimmed });
    },
    [editValue, renameMutation, cancelEdit],
  );

  useEffect(() => {
    if (editingId) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingId]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')}>
        <Button size="sm" onClick={startNew}>
          <Plus className="w-4 h-4" />
          {t('newChat')}
        </Button>
      </PageHeader>

      {isLoading && <ListSkeleton count={5} height="h-12" />}

      {!isLoading && conversations?.length === 0 && (
        <EmptyState
          icon={Sparkles}
          title={t('noConversations')}
          description={t('noConversationsDescription')}
          action={
            <Button onClick={startNew}>
              <Plus className="w-4 h-4" />
              {t('newChat')}
            </Button>
          }
        />
      )}

      {!isLoading && conversations && conversations.length > 0 && (
        <div className="space-y-1">
          {conversations.map((conv) =>
            editingId === conv.id ? (
              <div
                key={conv.id}
                className="flex items-center gap-3 rounded-lg border border-border px-4 py-3"
              >
                <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  ref={editInputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void commitEdit(conv.id);
                    } else if (e.key === 'Escape') {
                      cancelEdit();
                    }
                  }}
                  onBlur={() => void commitEdit(conv.id)}
                  maxLength={200}
                  className="h-7 text-sm flex-1 min-w-0"
                />
              </div>
            ) : (
              <ClickableListRow
                key={conv.id}
                icon={MessageSquare}
                title={conv.title}
                subtitle={new Date(conv.updated_at).toLocaleDateString()}
                onClick={() => navigate(conv.id)}
                onRename={() => startEdit(conv.id, conv.title)}
                onDelete={() => requestDelete(conv.id, conv.title)}
              />
            ),
          )}
        </div>
      )}

      <ConfirmDialog
        open={isOpen}
        onOpenChange={close}
        title={t('deleteTitle', { name: itemName ?? '' })}
        description={t('deleteDescription')}
        variant="destructive"
        onConfirm={async () => {
          if (itemId) await deleteMutation.mutateAsync(itemId);
        }}
      />
    </div>
  );
}

/* ───────────────────── Chat View ───────────────────── */

function AiChatView({ chatId, projectId }: { chatId: string | null; projectId: string }) {
  const { t } = useLocalTranslation(translations);
  const [, setSearchParams] = useSearchParams();
  const qc = useQueryClient();

  const {
    messages,
    conversationId,
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
  } = useAiChat(projectId);

  // Load existing conversation on mount
  const loadedRef = useRef(false);
  useEffect(() => {
    if (chatId && !loadedRef.current) {
      loadedRef.current = true;
      loadConversation(chatId);
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
      qc.invalidateQueries({ queryKey: ['ai-conversations', projectId] });
    },
    [sendMessage, projectId, qc],
  );

  const handleEdit = useCallback(
    async (sequence: number, newText: string) => {
      await editMessage(sequence, newText, projectId);
      qc.invalidateQueries({ queryKey: ['ai-conversations', projectId] });
    },
    [editMessage, projectId, qc],
  );

  const handleStop = useCallback(() => {
    stopStreaming();
    qc.invalidateQueries({ queryKey: ['ai-conversations', projectId] });
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

  return (
    <div className="-m-4 lg:-m-6 flex flex-col h-[calc(100vh-var(--topbar-height))] lg:h-screen">
      {/* Header */}
      <div className="h-[var(--topbar-height)] flex items-center gap-2 px-4 border-b border-border shrink-0">
        <Button variant="ghost" size="icon-xs" onClick={goBack} aria-label={t('back')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold truncate">
          {chatId ? t('chat') : t('newChatLabel')}
        </span>
      </div>

      {/* Chat panel */}
      <div className="flex-1 min-h-0">
        <AiChatPanel
          messages={messages}
          isStreaming={isStreaming}
          error={error}
          onSend={handleSend}
          onStop={handleStop}
          onEdit={handleEdit}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          onLoadMore={loadMoreMessages}
        />
      </div>
    </div>
  );
}
