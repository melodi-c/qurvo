import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDashboardList, useCreateDashboard, useDeleteDashboard } from '@/features/dashboard/hooks/use-dashboard';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { GridSkeleton } from '@/components/ui/grid-skeleton';
import { ConfirmDialog, useConfirmDelete } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { InlineCreateForm } from '@/components/ui/inline-create-form';
import { Plus, LayoutDashboard, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

export default function DashboardsPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const navigate = useNavigate();
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
    navigate(`/dashboards/${result.id}?project=${projectId}`);
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

          {isLoading && <GridSkeleton />}

          {!isLoading && (dashboards || []).length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(dashboards || []).map((dashboard) => (
                <Card
                  key={dashboard.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => navigate(`/dashboards/${dashboard.id}?project=${projectId}`)}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <LayoutDashboard className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <CardTitle className="text-base truncate">{dashboard.name}</CardTitle>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmDelete.requestDelete(dashboard.id, dashboard.name);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(dashboard.updated_at), { addSuffix: true })}
                    </p>
                  </CardHeader>
                </Card>
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
