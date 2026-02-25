import { useState, useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { api } from '@/api/client';
import { useProjectId } from '@/hooks/use-project-id';
import { useUpsertEventDefinition, eventDefinitionsKey } from '@/hooks/use-event-definitions';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './translations';

interface EventInfoCardProps {
  eventName: string;
  eventDef: {
    last_seen_at?: string | null;
    description?: string | null;
    tags?: string[] | null;
    verified?: boolean | null;
  };
}

export function EventInfoCard({ eventName, eventDef }: EventInfoCardProps) {
  const { t } = useLocalTranslation(translations);
  const projectId = useProjectId();
  const queryClient = useQueryClient();
  const { go } = useAppNavigate();
  const [description, setDescription] = useState(eventDef.description ?? '');
  const [tags, setTags] = useState((eventDef.tags ?? []).join(', '));
  const [verified, setVerified] = useState(eventDef.verified ?? false);
  const upsertMutation = useUpsertEventDefinition();
  const confirmDelete = useConfirmDelete();

  const deleteMutation = useMutation({
    mutationFn: () => api.eventDefinitionsControllerRemove({ projectId, eventName }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eventDefinitionsKey(projectId) }),
  });

  const handleDelete = useCallback(async () => {
    try {
      await deleteMutation.mutateAsync();
      toast.success(t('eventDeleted'));
      go.dataManagement.list();
    } catch {
      toast.error(t('eventDeleteFailed'));
    }
  }, [deleteMutation, t, go]);

  const hasChanges = useMemo(() => {
    const origDesc = eventDef.description ?? '';
    const origTags = (eventDef.tags ?? []).join(', ');
    const origVerified = eventDef.verified ?? false;
    return description !== origDesc || tags !== origTags || verified !== origVerified;
  }, [description, tags, verified, eventDef]);

  const handleSave = useCallback(async () => {
    const parsedTags = tags.split(',').map((t) => t.trim()).filter(Boolean);
    try {
      await upsertMutation.mutateAsync({
        eventName,
        data: {
          description: description || undefined,
          tags: parsedTags,
          verified,
        },
      });
      toast.success(t('eventUpdated'));
    } catch {
      toast.error(t('eventUpdateFailed'));
    }
  }, [eventName, description, tags, verified, upsertMutation, t]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t('eventInfo')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="event-description">{t('description')}</Label>
            <Input
              id="event-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('descriptionPlaceholder')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="event-tags">{t('tagsLabel')}</Label>
            <Input
              id="event-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={t('tagsPlaceholder')}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={verified}
                onChange={(e) => setVerified(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary accent-primary cursor-pointer"
              />
              {t('verified')}
            </label>
            <span className="text-sm text-muted-foreground">
              {t('lastSeen')} <span className="tabular-nums font-medium text-foreground">{eventDef.last_seen_at ? new Date(eventDef.last_seen_at).toLocaleDateString() : '\u2014'}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => confirmDelete.requestDelete(eventName, eventName)}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              {t('deleteEvent')}
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!hasChanges || upsertMutation.isPending}
            >
              {upsertMutation.isPending ? t('saving') : t('save')}
            </Button>
          </div>
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirmDelete.isOpen}
        onOpenChange={confirmDelete.close}
        title={t('deleteEventConfirm', { name: confirmDelete.itemName })}
        description={t('deleteEventDescription')}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        variant="destructive"
        onConfirm={handleDelete}
      />
    </Card>
  );
}
