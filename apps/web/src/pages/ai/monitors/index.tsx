import { useState, useCallback, useMemo } from 'react';
import { Bell, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { useProjectId } from '@/hooks/use-project-id';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';
import { useMonitors, useDeleteMonitor } from '@/features/ai-monitors/use-monitors';
import type { AiMonitor } from '@/features/ai-monitors/use-monitors';
import { MonitorFormDialog } from './monitor-form-dialog';
import { AiTabNav } from '../ai-tab-nav';
import translations from './monitors.translations';
import { extractApiErrorMessage } from '@/lib/utils';
import { getChannelTypeLabel } from '@/lib/channel-utils';

export default function MonitorsPage() {
  const { t } = useLocalTranslation(translations);
  const projectId = useProjectId();
  const { data: monitors, isLoading } = useMonitors(projectId ?? '');
  const deleteMutation = useDeleteMonitor(projectId ?? '');
  const { isOpen, itemId, itemName, requestDelete, close } = useConfirmDelete();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AiMonitor | null>(null);

  const handleDelete = useCallback(async () => {
    if (!itemId || !projectId) return;
    try {
      await deleteMutation.mutateAsync(itemId);
      toast.success(t('deleted'));
    } catch (err) {
      toast.error(extractApiErrorMessage(err, t('deleteErrorFallback')));
    }
  }, [itemId, projectId, deleteMutation, t]);

  const columns = useMemo((): Column<AiMonitor>[] => [
    {
      key: 'event_name',
      header: t('eventName'),
      render: (m) => <span className="font-mono text-sm">{m.event_name}</span>,
    },
    {
      key: 'metric',
      header: t('metric'),
      render: (m) => (
        <span>{m.metric === 'count' ? t('metricCount') : t('metricUniqueUsers')}</span>
      ),
    },
    {
      key: 'threshold_sigma',
      header: t('threshold'),
      render: (m) => <span>{t('sigmaLabel', { sigma: m.threshold_sigma })}</span>,
    },
    {
      key: 'channel_type',
      header: t('channel'),
      render: (m) => (
        <span>{getChannelTypeLabel(m.channel_type, t)}</span>
      ),
    },
    {
      key: 'is_active',
      header: t('status'),
      render: (m) => (
        <Badge variant={m.is_active ? 'default' : 'secondary'}>
          {m.is_active ? t('active') : t('inactive')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (m) => (
        <div className="flex items-center gap-1 justify-end">
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={(e) => { e.stopPropagation(); setEditTarget(m); }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={(e) => { e.stopPropagation(); requestDelete(m.id, m.event_name); }}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      ),
    },
  ], [t, requestDelete]);

  if (!projectId) {
    return <EmptyState icon={Bell} description={t('selectProject')} />;
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t('title')}>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          {t('newMonitor')}
        </Button>
      </PageHeader>

      <AiTabNav />

      {isLoading && <ListSkeleton count={3} />}

      {!isLoading && monitors?.length === 0 && (
        <EmptyState
          icon={Bell}
          title={t('noMonitors')}
          description={t('noMonitorsDescription')}
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              {t('newMonitor')}
            </Button>
          }
        />
      )}

      {!isLoading && monitors && monitors.length > 0 && (
        <DataTable
          columns={columns}
          data={monitors}
          rowKey={(m) => m.id}
        />
      )}

      <MonitorFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
      />

      {editTarget && (
        <MonitorFormDialog
          open={!!editTarget}
          onOpenChange={(open) => { if (!open) setEditTarget(null); }}
          projectId={projectId}
          monitor={editTarget}
        />
      )}

      <ConfirmDialog
        open={isOpen}
        onOpenChange={close}
        title={t('deleteTitle')}
        description={t('deleteDescription')}
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
