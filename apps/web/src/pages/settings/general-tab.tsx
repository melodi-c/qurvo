import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DefinitionList, DefinitionListRow } from '@/components/ui/definition-list';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { api } from '@/api/client';
import { toast } from 'sonner';
import { Settings, Pencil } from 'lucide-react';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './general-tab.translations';

export function GeneralTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { go } = useAppNavigate();
  const { t } = useLocalTranslation(translations);
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
      toast.success(t('updated'));
    },
    onError: () => toast.error(t('updateFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.projectsControllerRemove({ id: projectId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      go.settings();
      toast.success(t('deleted'));
    },
    onError: () => toast.error(t('deleteFailed')),
  });

  const confirmDelete = useConfirmDelete();

  if (!projectId) {
    return <EmptyState icon={Settings} description={t('selectProject')} />;
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
          <CardTitle className="text-sm">{t('projectDetails')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DefinitionList>
            {/* Name */}
            <DefinitionListRow label={t('name')}>
              <span className="text-right">
                {editing ? (
                  <span className="inline-flex items-center gap-2">
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
                      {updateMutation.isPending ? t('saving') : t('save')}
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>
                      {t('cancel')}
                    </Button>
                  </span>
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
              </span>
            </DefinitionListRow>

            {/* Slug */}
            <DefinitionListRow label={t('slug')}>
              <span className="text-muted-foreground font-mono text-xs">{project?.slug}</span>
            </DefinitionListRow>

            {/* Role */}
            <DefinitionListRow label={t('yourRole')}>
              <span className="capitalize">{project?.role}</span>
            </DefinitionListRow>
          </DefinitionList>
        </CardContent>
      </Card>

      {isOwner && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-sm text-destructive">{t('dangerZone')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t('deleteDescription')}
              </p>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => confirmDelete.requestDelete(projectId, project.name)}
              >
                {t('deleteProject')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmDelete.isOpen}
        onOpenChange={confirmDelete.close}
        title={t('deleteTitle', { name: confirmDelete.itemName })}
        description={t('deleteConfirmDescription')}
        confirmLabel={t('delete')}
        onConfirm={async () => {
          await deleteMutation.mutateAsync();
        }}
      />
    </div>
  );
}
