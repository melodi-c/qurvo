import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { InlineCreateForm } from '@/components/ui/inline-create-form';
import { GridSkeleton } from '@/components/ui/grid-skeleton';
import { ConfirmDialog, useConfirmDelete } from '@/components/ui/confirm-dialog';
import { api } from '@/api/client';
import { toast } from 'sonner';
import { Plus, FolderOpen } from 'lucide-react';

export default function ProjectsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projectsControllerList(),
  });

  const isFirstProject = !projects || projects.length === 0;

  const createMutation = useMutation({
    mutationFn: (data: { name: string }) => api.projectsControllerCreate(data),
    onSuccess: async (newProject) => {
      if (isFirstProject) {
        await queryClient.invalidateQueries({ queryKey: ['projects'] });
        navigate(`/dashboards?project=${newProject.id}`);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowCreate(false);
      setName('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.projectsControllerRemove({ id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
  const confirmDelete = useConfirmDelete();

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(confirmDelete.itemId);
      toast.success('Project deleted');
    } catch {
      toast.error('Failed to delete project');
    }
  };

  const hasProjects = projects && projects.length > 0;

  // Empty state — no projects yet
  if (!isLoading && !hasProjects) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-6 text-center max-w-md">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <FolderOpen className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Create your first project</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Projects isolate your analytics data. Each project has its own events, API keys, and dashboards.
            </p>
          </div>

          {showCreate ? (
            <div className="w-full">
              <InlineCreateForm
                placeholder="Project name"
                value={name}
                onChange={setName}
                isPending={createMutation.isPending}
                onSubmit={() => createMutation.mutate({ name })}
                onCancel={() => setShowCreate(false)}
              />
            </div>
          ) : (
            <Button onClick={() => setShowCreate(true)} size="lg">
              <Plus className="h-4 w-4 mr-2" /> New Project
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Projects">
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Project
        </Button>
      </PageHeader>

      {showCreate && (
        <InlineCreateForm
          placeholder="Project name"
          value={name}
          onChange={setName}
          isPending={createMutation.isPending}
          onSubmit={() => createMutation.mutate({ name })}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {isLoading && <GridSkeleton />}

      {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(projects || []).map((project) => (
            <Card key={project.id} className="cursor-pointer hover:border-primary/50 transition-colors">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2" onClick={() => { setSearchParams({ project: project.id }); navigate(`/?project=${project.id}`); }}>
                    <FolderOpen className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-base">{project.name}</CardTitle>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate(`/keys?project=${project.id}`)}>
                      Keys
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={(e) => { e.stopPropagation(); confirmDelete.requestDelete(project.id, project.name); }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">slug: {project.slug}</p>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete.isOpen}
        onOpenChange={confirmDelete.close}
        title={`Delete "${confirmDelete.itemName}"?`}
        description="This action cannot be undone. All project data will be permanently removed."
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </div>
  );
}
