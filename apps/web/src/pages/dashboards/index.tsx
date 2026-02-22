import { useState } from 'react';
import { useDashboardList, useCreateDashboard, useDeleteDashboard } from '@/features/dashboard/hooks/use-dashboard';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { ConfirmDialog, useConfirmDelete } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { InlineCreateForm } from '@/components/ui/inline-create-form';
import { Plus, LayoutDashboard, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { useAppNavigate } from '@/hooks/use-app-navigate';

export default function DashboardsPage() {
  const { go, projectId } = useAppNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');

  const { data: dashboards, isLoading } = useDashboardList();
  const createMutation = useCreateDashboard();
  const deleteMutation = useDeleteDashboard();
  const confirmDelete = useConfirmDelete();

  const handleCreate = async (value: string) => {
    if (!value.trim()) return;
    const result = await createMutation.mutateAsync(value.trim());
    setShowCreate(false);
    setName('');
    go.dashboards.detail(result.id);
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(confirmDelete.itemId);
      toast.success('Dashboard deleted');
    } catch {
      toast.error('Failed to delete dashboard');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboards">
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Dashboard
        </Button>
      </PageHeader>

      {!projectId && (
        <EmptyState icon={LayoutDashboard} description="Select a project to view dashboards" />
      )}

      {projectId && (
        <>
          {showCreate && (
            <InlineCreateForm
              placeholder="Dashboard name"
              value={name}
              onChange={setName}
              isPending={createMutation.isPending}
              onSubmit={handleCreate}
              onCancel={() => { setShowCreate(false); setName(''); }}
              pendingLabel="Creating..."
              autoFocus
            />
          )}

          {isLoading && <ListSkeleton count={5} height="h-12" />}

          {!isLoading && (dashboards || []).length > 0 && (
            <div className="space-y-1">
              {(dashboards || []).map((dashboard) => (
                <div
                  key={dashboard.id}
                  onClick={() => go.dashboards.detail(dashboard.id)}
                  className="group flex items-center gap-3 rounded-lg border border-border px-4 py-3 cursor-pointer transition-colors hover:bg-accent/50"
                >
                  <LayoutDashboard className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{dashboard.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(dashboard.updated_at), { addSuffix: true })}
                    </p>
                  </div>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0 p-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      confirmDelete.requestDelete(dashboard.id, dashboard.name);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {!isLoading && (dashboards || []).length === 0 && (
            <EmptyState
              icon={LayoutDashboard}
              title="No dashboards yet"
              description="Create a dashboard to get started"
              action={
                <Button onClick={() => setShowCreate(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Dashboard
                </Button>
              }
            />
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmDelete.isOpen}
        onOpenChange={confirmDelete.close}
        title={`Delete "${confirmDelete.itemName}"?`}
        description="This dashboard and all its widgets will be permanently removed."
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </div>
  );
}
