import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DefinitionList, DefinitionListRow } from '@/components/ui/definition-list';
import { InlineEditField } from '@/components/ui/inline-edit-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { api } from '@/api/client';
import { toast } from 'sonner';
import { Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { routes } from '@/lib/routes';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { getRoleLabel } from '@/lib/i18n-utils';
import translations from './general-tab.translations';

export function GeneralTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { t } = useLocalTranslation(translations);
  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projectsControllerGetById({ id: projectId }),
    enabled: !!projectId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; timezone?: string }) => api.projectsControllerUpdate({ id: projectId }, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(t('updated'));
    },
    onError: () => toast.error(t('updateFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.projectsControllerRemove({ id: projectId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void navigate(routes.projects());
      toast.success(t('deleted'));
    },
    onError: () => toast.error(t('deleteFailed')),
  });

  const confirmDelete = useConfirmDelete();

  if (!projectId) {
    return <EmptyState icon={Settings} description={t('selectProject')} />;
  }

  if (isLoading) {return <ListSkeleton count={1} height="h-32" />;}

  const isOwner = project?.role === 'owner';
  const isEditor = project?.role === 'owner' || project?.role === 'editor';

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
                <InlineEditField
                  value={project?.name ?? ''}
                  onSave={(name) => updateMutation.mutate({ name })}
                  isPending={updateMutation.isPending}
                  readOnly={!isOwner}
                  saveLabel={t('save')}
                  savingLabel={t('saving')}
                  cancelLabel={t('cancel')}
                />
              </span>
            </DefinitionListRow>

            {/* Role */}
            <DefinitionListRow label={t('yourRole')}>
              <span>{getRoleLabel(project?.role ?? '')}</span>
            </DefinitionListRow>

            {/* Timezone */}
            <DefinitionListRow label={t('timezone')}>
              <Select
                value={project?.timezone ?? 'UTC'}
                onValueChange={(tz) => updateMutation.mutate({ timezone: tz })}
                disabled={!isEditor}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Intl.supportedValuesOf('timeZone').map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
