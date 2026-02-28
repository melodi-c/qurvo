import { useState } from 'react';
import { useDashboardList, useCreateDashboard, useDeleteDashboard } from '@/features/dashboard/hooks/use-dashboard';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';
import { EmptyState } from '@/components/ui/empty-state';
import { InlineCreateForm } from '@/components/ui/inline-create-form';
import { Plus, LayoutDashboard, AlertTriangle } from 'lucide-react';
import { formatRelativeTime } from '@/lib/formatting';
import { ClickableListRow } from '@/components/ui/clickable-list-row';
import { toast } from 'sonner';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './index.translations';

export default function DashboardsPage() {
  const { t } = useLocalTranslation(translations);
  const { go, projectId } = useAppNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');

  const { data: dashboards, isLoading, isError, refetch } = useDashboardList();
  const createMutation = useCreateDashboard();
  const deleteMutation = useDeleteDashboard();
  const confirmDelete = useConfirmDelete();

  const handleCreate = async (value: string) => {
    if (!value.trim()) {return;}
    const result = await createMutation.mutateAsync(value.trim());
    setShowCreate(false);
    setName('');
    toast.success(t('created'));
    void go.dashboards.detail(result.id);
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(confirmDelete.itemId);
      toast.success(t('deleted'));
    } catch {
      toast.error(t('deleteFailed'));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')}>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('newDashboard')}
        </Button>
      </PageHeader>

      {!projectId && (
        <EmptyState icon={LayoutDashboard} description={t('selectProject')} />
      )}

      {projectId && (
        <>
          {showCreate && (
            <InlineCreateForm
              placeholder={t('placeholder')}
              value={name}
              onChange={setName}
              isPending={createMutation.isPending}
              onSubmit={handleCreate}
              onCancel={() => { setShowCreate(false); setName(''); }}
              pendingLabel={t('creating')}
              autoFocus
            />
          )}

          {isLoading && <ListSkeleton count={5} height="h-12" />}

          {!isLoading && isError && (
            <EmptyState
              icon={AlertTriangle}
              description={t('errorLoading')}
              action={
                <Button variant="outline" onClick={() => refetch()}>
                  {t('retry')}
                </Button>
              }
            />
          )}

          {!isLoading && !isError && (dashboards || []).length > 0 && (
            <div className="space-y-1">
              {(dashboards || []).map((dashboard) => (
                <ClickableListRow
                  key={dashboard.id}
                  icon={LayoutDashboard}
                  title={dashboard.name}
                  subtitle={formatRelativeTime(dashboard.updated_at)}
                  onClick={() => go.dashboards.detail(dashboard.id)}
                  onDelete={() => confirmDelete.requestDelete(dashboard.id, dashboard.name)}
                />
              ))}
            </div>
          )}

          {!isLoading && !isError && (dashboards || []).length === 0 && (
            <EmptyState
              icon={LayoutDashboard}
              title={t('noYet')}
              description={t('createToStart')}
              action={
                <Button onClick={() => setShowCreate(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('newDashboard')}
                </Button>
              }
            />
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmDelete.isOpen}
        onOpenChange={confirmDelete.close}
        title={t('deleteTitle', { name: confirmDelete.itemName })}
        description={t('deleteDescription')}
        confirmLabel={t('delete')}
        onConfirm={handleDelete}
      />
    </div>
  );
}
