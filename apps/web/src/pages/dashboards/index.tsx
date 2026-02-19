import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDashboardList, useCreateDashboard, useDeleteDashboard } from '@/features/dashboard/hooks/use-dashboard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, LayoutDashboard, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { DashboardWithWidgets } from '@/features/dashboard/types';

export default function DashboardsPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');

  const { data: dashboards, isLoading } = useDashboardList();
  const createMutation = useCreateDashboard();
  const deleteMutation = useDeleteDashboard();

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Select a project to view dashboards
      </div>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const result = await createMutation.mutateAsync(name.trim()) as any;
    setShowCreate(false);
    setName('');
    navigate(`/dashboards/${result.id}?project=${projectId}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboards</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Dashboard
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleCreate} className="flex gap-3">
              <Input
                placeholder="Dashboard name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                className="flex-1"
              />
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowCreate(false);
                  setName('');
                }}
              >
                Cancel
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading && <p className="text-muted-foreground text-sm">Loading...</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(dashboards || []).map((dashboard) => {
          const d = dashboard as unknown as DashboardWithWidgets;
          return (
            <Card
              key={d.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => navigate(`/dashboards/${d.id}?project=${projectId}`)}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <LayoutDashboard className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <CardTitle className="text-base truncate">{d.name}</CardTitle>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMutation.mutate(d.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {d.widgets?.length ?? 0} widget{(d.widgets?.length ?? 0) !== 1 ? 's' : ''} ·{' '}
                  {formatDistanceToNow(new Date(d.updated_at), { addSuffix: true })}
                </p>
              </CardHeader>
            </Card>
          );
        })}
        {!isLoading && (dashboards || []).length === 0 && (
          <div className="col-span-3 text-center py-12 text-muted-foreground">
            <LayoutDashboard className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No dashboards yet. Create one to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
