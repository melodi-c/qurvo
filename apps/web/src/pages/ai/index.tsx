import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Plus, MessageSquare, Trash2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { ConfirmDialog, useConfirmDelete } from '@/components/ui/confirm-dialog';
import { AiChatPanel } from './ai-chat-panel';
import { useAiChat } from './use-ai-chat';

const API_URL = import.meta.env.VITE_API_URL || '';

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

function useConversations(projectId: string) {
  return useQuery<Conversation[]>({
    queryKey: ['ai-conversations', projectId],
    queryFn: async () => {
      const token = localStorage.getItem('qurvo_token');
      const res = await fetch(
        `${API_URL}/api/ai/conversations?project_id=${projectId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error('Failed to load conversations');
      return res.json();
    },
    enabled: !!projectId,
  });
}

function useDeleteConversation(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const token = localStorage.getItem('qurvo_token');
      await fetch(`${API_URL}/api/ai/conversations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-conversations', projectId] });
    },
  });
}

export default function AiPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const chatId = searchParams.get('chat');

  if (!projectId) {
    return <EmptyState icon={Sparkles} description="Select a project to use AI Assistant" />;
  }

  if (chatId) {
    return <AiChatView chatId={chatId === 'new' ? null : chatId} projectId={projectId} />;
  }

  return <AiListView projectId={projectId} />;
}

/* ───────────────────── List View ───────────────────── */

function AiListView({ projectId }: { projectId: string }) {
  const [, setSearchParams] = useSearchParams();
  const { data: conversations, isLoading } = useConversations(projectId);
  const deleteMutation = useDeleteConversation(projectId);
  const { isOpen, itemId, itemName, requestDelete, close } = useConfirmDelete();

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

  return (
    <div className="space-y-6">
      <PageHeader title="AI Assistant">
        <Button size="sm" onClick={startNew}>
          <Plus className="w-4 h-4" />
          New Chat
        </Button>
      </PageHeader>

      {isLoading && <ListSkeleton count={5} height="h-12" />}

      {!isLoading && conversations?.length === 0 && (
        <EmptyState
          icon={Sparkles}
          title="No conversations yet"
          description="Start a new chat to ask questions about your analytics data"
          action={
            <Button onClick={startNew}>
              <Plus className="w-4 h-4" />
              New Chat
            </Button>
          }
        />
      )}

      {!isLoading && conversations && conversations.length > 0 && (
        <div className="space-y-1">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => navigate(conv.id)}
              className="group flex items-center gap-3 rounded-lg border border-border px-4 py-3 cursor-pointer transition-colors hover:bg-accent/50"
            >
              <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{conv.title}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(conv.updated_at).toLocaleDateString()}
                </p>
              </div>
              <button
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0 p-1"
                onClick={(e) => {
                  e.stopPropagation();
                  requestDelete(conv.id, conv.title);
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={isOpen}
        onOpenChange={close}
        title={`Delete "${itemName}"?`}
        description="This conversation will be permanently deleted."
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
    loadConversation,
    loadMoreMessages,
    startNewConversation,
    stopStreaming,
  } = useAiChat();

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
    (text: string) => {
      sendMessage(text, projectId);
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['ai-conversations', projectId] });
      }, 2000);
    },
    [sendMessage, projectId, qc],
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
    <div className="-m-4 lg:-m-6 flex flex-col h-[calc(100vh-44px)] lg:h-screen">
      {/* Header */}
      <div className="h-[44px] flex items-center gap-2 px-4 border-b border-border shrink-0">
        <button
          onClick={goBack}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold truncate">
          {chatId ? 'Chat' : 'New Chat'}
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
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          onLoadMore={loadMoreMessages}
        />
      </div>
    </div>
  );
}
