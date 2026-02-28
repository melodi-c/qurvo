import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PageHeader } from '@/components/ui/page-header';
import { InlineCreateForm } from '@/components/ui/inline-create-form';
import { GridSkeleton } from '@/components/ui/grid-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';
import { Plus, FolderOpen, AlertTriangle, Sparkles, MoreHorizontal, Key, Trash2 } from 'lucide-react';
import { routes } from '@/lib/routes';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './projects.translations';
import { useProjects } from '@/features/projects/hooks/use-projects';

export default function ProjectsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const navigate = useNavigate();
  const { t } = useLocalTranslation(translations);

  const {
    projects,
    isLoading,
    isError,
    refetch,
    createMutation,
    createDemoMutation,
    deleteMutation,
  } = useProjects();

  const confirmDelete = useConfirmDelete();

  const handleCreate = () => {
    createMutation.mutate({ name }, {
      onSuccess: () => {
        setShowCreate(false);
        setName('');
      },
    });
  };

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(confirmDelete.itemId);
  };

  const hasProjects = projects && projects.length > 0;

  if (!isLoading && isError) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState
          icon={AlertTriangle}
          description={t('errorLoading')}
          action={
            <Button variant="outline" onClick={() => refetch()}>
              {t('retry')}
            </Button>
          }
        />
      </div>
    );
  }

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
                onSubmit={handleCreate}
                onCancel={() => setShowCreate(false)}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 w-full">
              <Button onClick={() => setShowCreate(true)} size="lg">
                <Plus className="h-4 w-4 mr-2" /> {t('newProject')}
              </Button>
              <span className="text-xs text-muted-foreground">{t('orLabel')}</span>
              <Button
                variant="outline"
                size="lg"
                onClick={() => createDemoMutation.mutate()}
                disabled={createDemoMutation.isPending}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {createDemoMutation.isPending ? t('demoCreating') : t('tryDemo')}
              </Button>
              <p className="text-xs text-muted-foreground max-w-xs">
                {t('tryDemoDescription')}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')}>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => createDemoMutation.mutate()}
            disabled={createDemoMutation.isPending}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {createDemoMutation.isPending ? t('demoCreating') : t('tryDemo')}
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" /> {t('newProject')}
          </Button>
        </div>
      </PageHeader>

      {showCreate && (
        <InlineCreateForm
          placeholder={t('placeholder')}
          value={name}
          onChange={setName}
          isPending={createMutation.isPending}
          onSubmit={handleCreate}
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
              onClick={() => navigate(routes.dashboards.list(project.id))}
            >
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderOpen className="h-5 w-5 text-muted-foreground shrink-0" />
                    <CardTitle className="text-base truncate">{project.name}</CardTitle>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => navigate(routes.keys(project.id))}>
                        <Key />
                        {t('keys')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => confirmDelete.requestDelete(project.id, project.name)}>
                        <Trash2 />
                        {t('delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
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
