import { useState, useMemo, useCallback } from 'react';
import { Database, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { RequireProject } from '@/components/require-project';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useEventDefinitions } from '@/hooks/use-event-definitions';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './event-definitions.translations';
import type { EventDefinition } from '@/api/generated/Api';

export default function EventDefinitionsPage() {
  const { t } = useLocalTranslation(translations);
  const { go } = useAppNavigate();
  const [search, setSearch] = useState('');

  const { data: definitions, isLoading, isError, refetch } = useEventDefinitions();

  const filtered = useMemo(
    () => definitions?.filter((d) => d.event_name.toLowerCase().includes(search.toLowerCase())),
    [definitions, search],
  );

  const columns: Column<EventDefinition>[] = useMemo(() => [
    {
      key: 'event_name',
      header: t('eventName'),
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-foreground">{row.event_name}</span>
          {row.verified && (
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-primary/15">
              <Check className="w-3 h-3 text-primary" />
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'last_seen_at',
      header: t('lastSeen'),
      headerClassName: 'w-40',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {row.last_seen_at ? new Date(row.last_seen_at).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      key: 'description',
      header: t('description'),
      hideOnMobile: true,
      render: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.description || <span className="italic opacity-40">{t('noDescription')}</span>}
        </span>
      ),
    },
    {
      key: 'tags',
      header: t('tags'),
      hideOnMobile: true,
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {(row.tags ?? []).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      ),
    },
  ], [t]);

  const handleRowClick = useCallback(
    (row: EventDefinition) => {
      go.dataManagement.detail(row.event_name);
    },
    [go],
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />

      <RequireProject icon={Database} description={t('selectProject')}>
        {isLoading && <ListSkeleton count={8} />}

        {!isLoading && isError && (
          <EmptyState
            icon={AlertTriangle}
            description={t('errorLoading')}
            action={
              <Button variant="outline" onClick={() => refetch()}>
                {t('retry')}
              </Button>
            }
          />
        )}

        {!isLoading && !isError && (
          <>
            <div className="flex items-center gap-3">
              <Input
                placeholder={t('searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
              />
              {filtered && (
                <span className="text-sm text-muted-foreground">
                  {filtered.length !== 1
                    ? t('eventCountPlural', { count: filtered.length })
                    : t('eventCount', { count: filtered.length })}
                </span>
              )}
            </div>

            {filtered && filtered.length === 0 && (
              <EmptyState
                icon={Database}
                title={t('noEventsFound')}
                description={search ? t('noEventsMatch') : t('noEventsTracked')}
              />
            )}

            {filtered && filtered.length > 0 && (
              <DataTable
                columns={columns}
                data={filtered}
                rowKey={(row) => row.event_name}
                onRowClick={handleRowClick}
              />
            )}
          </>
        )}
      </RequireProject>
    </div>
  );
}
