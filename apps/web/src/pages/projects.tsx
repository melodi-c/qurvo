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
import { routes } from '@/lib/routes';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './projects.translations';

export default function ProjectsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const { t } = useLocalTranslation(translations);

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
        navigate(`${routes.dashboards.list()}?project=${newProject.id}`);
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
      toast.success(t('deleted'));
    } catch {
      toast.error(t('deleteFailed'));
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
            <h2 className="text-lg font-semibold">{t('createFirst')}</h2>
            <p className="text-sm text-muted-foreground mt-2">
              {t('createDescription')}
            </p>
          </div>

          {showCreate ? (
            <div className="w-full">
              <InlineCreateForm
                placeholder={t('placeholder')}
                value={name}
                onChange={setName}
                isPending={createMutation.isPending}
                onSubmit={() => createMutation.mutate({ name })}
                onCancel={() => setShowCreate(false)}
              />
            </div>
          ) : (
            <Button onClick={() => setShowCreate(true)} size="lg">
              <Plus className="h-4 w-4 mr-2" /> {t('newProject')}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')}>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" /> {t('newProject')}
        </Button>
      </PageHeader>

      {showCreate && (
        <InlineCreateForm
          placeholder={t('placeholder')}
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
            <Card
              key={project.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => { setSearchParams({ project: project.id }); navigate(`${routes.home()}?project=${project.id}`); }}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-base">{project.name}</CardTitle>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); navigate(`${routes.keys()}?project=${project.id}`); }}>
                      {t('keys')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={(e) => { e.stopPropagation(); confirmDelete.requestDelete(project.id, project.name); }}
                    >
                      {t('delete')}
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
        title={t('deleteTitle', { name: confirmDelete.itemName })}
        description={t('deleteDescription')}
        confirmLabel={t('delete')}
        onConfirm={handleDelete}
      />
    </div>
  );
}
