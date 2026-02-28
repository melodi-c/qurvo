import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { formatRelativeTime } from '@/lib/formatting';
import translations from './ingestion-warnings-tab.translations';
import { useIngestionWarnings } from './hooks/use-ingestion-warnings';

function WarningTypeBadge({ type }: { type: string }) {
  const { t } = useLocalTranslation(translations);
  const label =
    type === 'invalid_event' ? t('typeInvalidEvent')
    : type === 'illegal_distinct_id' ? t('typeIllegalDistinctId')
    : t('typeUnknown');
  const variant = type === 'invalid_event' ? 'destructive' : 'secondary';
  return <Badge variant={variant}>{label}</Badge>;
}

function DetailsCell({ details }: { details: string }) {
  try {
    const parsed = JSON.parse(details) as Record<string, unknown>;
    return (
      <div className="space-y-0.5 text-xs text-muted-foreground">
        {!!parsed['event_name'] && <div><span className="text-foreground">event:</span> {String(parsed['event_name'])}</div>}
        {!!parsed['distinct_id'] && <div><span className="text-foreground">distinct_id:</span> {String(parsed['distinct_id'])}</div>}
        {!!parsed['reason'] && <div><span className="text-foreground">reason:</span> {String(parsed['reason'])}</div>}
      </div>
    );
  } catch {
    return <span className="text-xs text-muted-foreground">{details}</span>;
  }
}

export function IngestionWarningsTab({ projectId }: { projectId: string }) {
  const { t } = useLocalTranslation(translations);
  const { data: warnings, isLoading, isError, refetch } = useIngestionWarnings(projectId);

  const columns: Column<{ project_id: string; type: string; details: string; timestamp: string }>[] = useMemo(() => [
    {
      key: 'type',
      header: t('type'),
      render: (row) => <WarningTypeBadge type={row.type} />,
    },
    {
      key: 'details',
      header: t('details'),
      render: (row) => <DetailsCell details={row.details} />,
    },
    {
      key: 'timestamp',
      header: t('timestamp'),
      render: (row) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatRelativeTime(row.timestamp)}
        </span>
      ),
    },
  ], [t]);

  return (
    <div className="space-y-4 max-w-4xl">
      <p className="text-sm text-muted-foreground">{t('description')}</p>

      {isLoading && <ListSkeleton count={3} height="h-12" />}

      {isError && (
        <EmptyState
          icon={AlertTriangle}
          description={t('loadError')}
          action={
            <Button variant="outline" onClick={() => refetch()}>
              {t('retry')}
            </Button>
          }
        />
      )}

      {!isLoading && !isError && warnings && warnings.length === 0 && (
        <EmptyState
          icon={AlertTriangle}
          title={t('noWarnings')}
          description={t('noWarningsDescription')}
        />
      )}

      {!isLoading && !isError && warnings && warnings.length > 0 && (
        <DataTable
          columns={columns}
          data={warnings}
          rowKey={(row) => `${row.type}-${row.timestamp}-${row.details}`}
        />
      )}
    </div>
  );
}
