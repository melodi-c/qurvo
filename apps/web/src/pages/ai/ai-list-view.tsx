import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sparkles, Plus, MessageSquare, Users } from 'lucide-react';
import { ClickableListRow } from '@/components/ui/clickable-list-row';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TabNav } from '@/components/ui/tab-nav';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useConversations, useSharedConversations, useDeleteConversation, useRenameConversation } from '@/features/ai/hooks/use-ai-conversations';
import translations from './index.translations';

type AiTab = 'mine' | 'shared';

export function AiListView({ projectId }: { projectId: string }) {
  const { t } = useLocalTranslation(translations);
  const [, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<AiTab>('mine');
  const { data: conversations, isLoading } = useConversations(projectId);
  const { data: sharedConversations, isLoading: isLoadingShared } = useSharedConversations(projectId);
  const deleteMutation = useDeleteConversation(projectId);
  const renameMutation = useRenameConversation(projectId);
  const { isOpen, itemId, itemName, requestDelete, close } = useConfirmDelete();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const tabs = useMemo(() => [
    { id: 'mine' as AiTab, label: t('tabMine') },
    { id: 'shared' as AiTab, label: t('tabShared') },
  ], [t]);

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
    <div className="space-y-4">
      <PageHeader title={t('title')}>
        <Button size="sm" onClick={startNew}>
          <Plus className="w-4 h-4" />
          {t('newChat')}
        </Button>
      </PageHeader>

      <TabNav tabs={tabs} value={activeTab} onChange={setActiveTab} />

      {activeTab === 'mine' && (
        <>
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
                    icon={conv.is_shared ? Users : MessageSquare}
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
        </>
      )}

      {activeTab === 'shared' && (
        <>
          {isLoadingShared && <ListSkeleton count={5} height="h-12" />}

          {!isLoadingShared && sharedConversations?.length === 0 && (
            <EmptyState
              icon={Users}
              title={t('noSharedConversations')}
              description={t('noSharedConversationsDescription')}
            />
          )}

          {!isLoadingShared && sharedConversations && sharedConversations.length > 0 && (
            <div className="space-y-1">
              {sharedConversations.map((conv) => (
                <ClickableListRow
                  key={conv.id}
                  icon={Users}
                  title={conv.title}
                  subtitle={new Date(conv.updated_at).toLocaleDateString()}
                  onClick={() => navigate(conv.id)}
                />
              ))}
            </div>
          )}
        </>
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
