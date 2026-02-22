import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Pencil, Trash2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { InsightTypeIcon } from './InsightTypeIcon';
import type { Insight, TrendWidgetConfig, FunnelWidgetConfig, RetentionWidgetConfig, LifecycleWidgetConfig, StickinessWidgetConfig } from '@/api/generated/Api';
import { routes } from '@/lib/routes';

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

const TYPE_LABELS: Record<string, string> = {
  trend: 'Trend',
  funnel: 'Funnel',
  retention: 'Retention',
  lifecycle: 'Lifecycle',
  stickiness: 'Stickiness',
};

interface InsightsTableProps {
  data: Insight[];
  onToggleFavorite: (id: string, current: boolean) => void;
  onDelete: (id: string) => Promise<void>;
}

export function InsightsTable({ data, onToggleFavorite, onDelete }: InsightsTableProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') ?? '';
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const handleRowClick = useCallback(
    (row: Insight) => navigate(routes.insights.detailByType(row.type, row.id, projectId)),
    [navigate, projectId],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await onDelete(deleteTarget.id);
      toast.success('Insight deleted');
    } catch {
      toast.error('Failed to delete insight');
    }
  }, [deleteTarget, onDelete]);

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
      header: 'Name',
      render: (row) => (
        <div>
          <span className="font-medium text-foreground">{row.name}</span>
          <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate max-w-[360px]">
            {getTypeSubtitle(row)}
          </p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      headerClassName: 'w-28',
      hideOnMobile: true,
      render: (row) => (
        <Badge variant="secondary" className="font-normal text-xs">
          {TYPE_LABELS[row.type]}
        </Badge>
      ),
    },
    {
      key: 'updated',
      header: 'Updated',
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
      headerClassName: 'text-right w-28',
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
            className="h-7 w-7 p-0"
            onClick={() => navigate(routes.insights.detailByType(row.type, row.id, projectId))}
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
  ], [onToggleFavorite, navigate, projectId]);

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
        title={`Delete "${deleteTarget?.name}"?`}
        description="This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </>
  );
}
