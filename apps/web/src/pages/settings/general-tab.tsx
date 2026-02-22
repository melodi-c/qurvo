import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog, useConfirmDelete } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { api } from '@/api/client';
import { toast } from 'sonner';
import { Settings, Pencil } from 'lucide-react';
import { useAppNavigate } from '@/hooks/use-app-navigate';

export function GeneralTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { go } = useAppNavigate();
  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projectsControllerGetById({ id: projectId }),
    enabled: !!projectId,
  });

  const [name, setName] = useState('');
  const [editing, setEditing] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (data: { name: string }) => api.projectsControllerUpdate({ id: projectId }, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setEditing(false);
      toast.success('Project updated');
    },
    onError: () => toast.error('Failed to update project'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.projectsControllerRemove({ id: projectId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      go.settings();
      toast.success('Project deleted');
    },
    onError: () => toast.error('Failed to delete project'),
  });

  const confirmDelete = useConfirmDelete();

  if (!projectId) {
    return <EmptyState icon={Settings} description="Select a project to manage settings" />;
  }

  if (isLoading) return <ListSkeleton count={1} height="h-32" />;

  const isOwner = project?.role === 'owner';

  const startEditing = () => {
    setName(project?.name || '');
    setEditing(true);
  };

  return (
    <div className="space-y-6 max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Project Details</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <dl className="divide-y divide-border text-sm">
            {/* Name */}
            <div className="flex items-center justify-between px-6 py-3">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="text-right">
                {editing ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-7 w-48 text-sm"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && name.trim()) updateMutation.mutate({ name });
                        if (e.key === 'Escape') setEditing(false);
                      }}
                    />
                    <Button
                      size="xs"
                      onClick={() => updateMutation.mutate({ name })}
                      disabled={updateMutation.isPending || !name.trim()}
                    >
                      {updateMutation.isPending ? 'Saving...' : 'Save'}
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    {project?.name}
                    {isOwner && (
                      <button onClick={startEditing} className="text-muted-foreground hover:text-foreground transition-colors">
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                )}
              </dd>
            </div>

            {/* Slug */}
            <div className="flex items-center justify-between px-6 py-3">
              <dt className="text-muted-foreground">Slug</dt>
              <dd className="text-muted-foreground font-mono text-xs">{project?.slug}</dd>
            </div>

            {/* Role */}
            <div className="flex items-center justify-between px-6 py-3">
              <dt className="text-muted-foreground">Your Role</dt>
              <dd className="capitalize">{project?.role}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {isOwner && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-sm text-destructive">Danger Zone</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Permanently delete this project and all its data.
              </p>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => confirmDelete.requestDelete(projectId, project.name)}
              >
                Delete Project
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmDelete.isOpen}
        onOpenChange={confirmDelete.close}
        title={`Delete "${confirmDelete.itemName}"?`}
        description="This action cannot be undone. All project data will be permanently removed."
        confirmLabel="Delete"
        onConfirm={async () => {
          await deleteMutation.mutateAsync();
        }}
      />
    </div>
  );
}
