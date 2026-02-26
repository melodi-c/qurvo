import { useState, useCallback, useMemo } from 'react';
import { Clock, Plus, Pencil, Trash2 } from 'lucide-react';
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
import { useScheduledJobs, useDeleteScheduledJob } from '@/features/ai-scheduled-jobs/use-scheduled-jobs';
import type { AiScheduledJob } from '@/api/generated/Api';
import { ScheduledJobFormDialog } from './scheduled-job-form-dialog';
import { AiTabNav } from '../ai-tab-nav';
import translations from './scheduled-jobs.translations';
import { extractApiErrorMessage } from '@/lib/utils';
import { getChannelTypeLabel } from '@/lib/channel-utils';
import { formatDate } from '@/lib/formatting';

export default function ScheduledJobsPage() {
  const { t } = useLocalTranslation(translations);
  const projectId = useProjectId();
  const { data: jobs, isLoading } = useScheduledJobs(projectId ?? '');
  const deleteMutation = useDeleteScheduledJob(projectId ?? '');
  const { isOpen, itemId, itemName, requestDelete, close } = useConfirmDelete();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AiScheduledJob | null>(null);

  const handleDelete = useCallback(async () => {
    if (!itemId || !projectId) return;
    try {
      await deleteMutation.mutateAsync(itemId);
      toast.success(t('deleted'));
    } catch (err) {
      toast.error(extractApiErrorMessage(err, t('deleteErrorFallback')));
    }
  }, [itemId, projectId, deleteMutation, t]);

  const scheduleLabel = useCallback((schedule: string) => {
    if (schedule === 'daily') return t('scheduleDaily');
    if (schedule === 'weekly') return t('scheduleWeekly');
    if (schedule === 'monthly') return t('scheduleMonthly');
    return schedule;
  }, [t]);

  const columns = useMemo((): Column<AiScheduledJob>[] => [
    {
      key: 'name',
      header: t('name'),
      render: (j) => <span className="font-medium text-sm">{j.name}</span>,
    },
    {
      key: 'prompt',
      header: t('prompt'),
      render: (j) => (
        <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
          {j.prompt.length > 80 ? j.prompt.slice(0, 80) + '...' : j.prompt}
        </span>
      ),
    },
    {
      key: 'schedule',
      header: t('schedule'),
      render: (j) => <span>{scheduleLabel(j.schedule)}</span>,
    },
    {
      key: 'channel_type',
      header: t('channel'),
      render: (j) => (
        <span>{getChannelTypeLabel(j.channel_type, t)}</span>
      ),
    },
    {
      key: 'last_run_at',
      header: t('lastRun'),
      render: (j) => (
        <span className="text-sm text-muted-foreground">
          {j.last_run_at ? formatDate(j.last_run_at) : t('never')}
        </span>
      ),
    },
    {
      key: 'is_active',
      header: t('status'),
      render: (j) => (
        <Badge variant={j.is_active ? 'default' : 'secondary'}>
          {j.is_active ? t('active') : t('inactive')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (j) => (
        <div className="flex items-center gap-1 justify-end">
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={(e) => { e.stopPropagation(); setEditTarget(j); }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={(e) => { e.stopPropagation(); requestDelete(j.id, j.name); }}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      ),
    },
  ], [t, requestDelete, scheduleLabel]);

  if (!projectId) {
    return <EmptyState icon={Clock} description={t('selectProject')} />;
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t('title')}>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          {t('newJob')}
        </Button>
      </PageHeader>

      <AiTabNav />

      {isLoading && <ListSkeleton count={3} />}

      {!isLoading && jobs?.length === 0 && (
        <EmptyState
          icon={Clock}
          title={t('noJobs')}
          description={t('noJobsDescription')}
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              {t('newJob')}
            </Button>
          }
        />
      )}

      {!isLoading && jobs && jobs.length > 0 && (
        <DataTable
          columns={columns}
          data={jobs}
          rowKey={(j) => j.id}
        />
      )}

      <ScheduledJobFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
      />

      {editTarget && (
        <ScheduledJobFormDialog
          open={!!editTarget}
          onOpenChange={(open) => { if (!open) setEditTarget(null); }}
          projectId={projectId}
          job={editTarget}
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
