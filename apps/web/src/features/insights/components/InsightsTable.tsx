import { useCallback, useMemo, useState } from 'react';
import { Pencil, Trash2, Star, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ShareDialog } from '@/components/ui/share-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { InsightTypeIcon } from './InsightTypeIcon';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useProjectId } from '@/hooks/use-project-id';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './InsightsTable.translations';
import type { Insight, TrendWidgetConfig, FunnelWidgetConfig, RetentionWidgetConfig, LifecycleWidgetConfig, StickinessWidgetConfig } from '@/api/generated/Api';

function getTypeSubtitle(insight: Insight): string {
  if (insight.type === 'trend') {
    const config = insight.config as TrendWidgetConfig;
    if (!config.series?.length) return '\u2014';
    return config.series.map((s) => s.event_name).join(', ');
  }
  if (insight.type === 'funnel') {
    const config = insight.config as FunnelWidgetConfig;
    if (!config.steps?.length) return '\u2014';
    return config.steps.map((s) => s.event_name).join(' \u2192 ');
  }
  if (insight.type === 'retention') {
    const config = insight.config as RetentionWidgetConfig;
    return config.target_event || '\u2014';
  }
  if (insight.type === 'lifecycle') {
    const config = insight.config as LifecycleWidgetConfig;
    return config.target_event || '\u2014';
  }
  if (insight.type === 'stickiness') {
    const config = insight.config as StickinessWidgetConfig;
    return config.target_event || '\u2014';
  }
  return '\u2014';
}

interface InsightsTableProps {
  data: Insight[];
  onToggleFavorite: (id: string, current: boolean) => void;
  onDelete: (id: string) => Promise<void>;
}

export function InsightsTable({ data, onToggleFavorite, onDelete }: InsightsTableProps) {
  const { go } = useAppNavigate();
  const projectId = useProjectId();
  const { t } = useLocalTranslation(translations);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [shareTarget, setShareTarget] = useState<{ id: string } | null>(null);

  const typeLabels: Record<string, string> = useMemo(() => ({
    trend: t('typeTrend'),
    funnel: t('typeFunnel'),
    retention: t('typeRetention'),
    lifecycle: t('typeLifecycle'),
    stickiness: t('typeStickiness'),
  }), [t]);

  const handleRowClick = useCallback(
    (row: Insight) => go.insights.detailByType(row.type, row.id),
    [go],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await onDelete(deleteTarget.id);
      toast.success(t('toastDeleted'));
    } catch {
      toast.error(t('toastDeleteFailed'));
    }
  }, [deleteTarget, onDelete, t]);

  const columns = useMemo<Column<Insight>[]>(() => [
    {
      key: 'type-icon',
      header: '',
      headerClassName: 'w-10',
      className: 'w-10',
      render: (row) => <InsightTypeIcon type={row.type} />,
    },
    {
      key: 'name',
      header: t('name'),
      render: (row) => (
        <div>
          <span className="font-medium text-foreground">{row.name}</span>
          <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate max-w-[360px]">
            {getTypeSubtitle(row)}
          </p>
          {row.description && (
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-xs text-muted-foreground/70 mt-0.5 truncate max-w-[360px]">
                  {row.description}
                </p>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs whitespace-normal">
                {row.description}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      key: 'type',
      header: t('type'),
      headerClassName: 'w-28',
      hideOnMobile: true,
      render: (row) => (
        <Badge variant="secondary" className="font-normal text-xs">
          {typeLabels[row.type]}
        </Badge>
      ),
    },
    {
      key: 'updated',
      header: t('updated'),
      headerClassName: 'w-28',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.updated_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'text-right w-36',
      className: 'text-right',
      render: (row) => (
        <div
          className="flex items-center justify-end gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-7 w-7 p-0', row.is_favorite ? 'text-amber-400' : 'text-muted-foreground')}
            onClick={() => onToggleFavorite(row.id, row.is_favorite)}
          >
            <Star className={cn('h-3.5 w-3.5', row.is_favorite && 'fill-current')} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground"
            onClick={() => setShareTarget({ id: row.id })}
            title={t('share')}
          >
            <Share2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => go.insights.detailByType(row.type, row.id)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => setDeleteTarget({ id: row.id, name: row.name })}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ], [onToggleFavorite, go, t, typeLabels]);

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        rowKey={(row) => row.id}
        onRowClick={handleRowClick}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={t('deleteTitle', { name: deleteTarget?.name ?? '' })}
        description={t('deleteDescription')}
        confirmLabel={t('deleteConfirm')}
        onConfirm={handleDelete}
      />
      {shareTarget && (
        <ShareDialog
          open={shareTarget !== null}
          onOpenChange={(open) => { if (!open) setShareTarget(null); }}
          resourceType="insight"
          resourceId={shareTarget.id}
          projectId={projectId}
        />
      )}
    </>
  );
}
