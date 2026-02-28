import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EventDetail, type EventLike } from '@/components/event-detail';
import { EventTypeIcon } from '@/components/EventTypeIcon';
import { eventBadgeVariant, formatDateTime, formatRelativeTime } from '@/lib/formatting';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useEventDefinitions, buildDescriptionMap } from '@/hooks/use-event-definitions';
import translations from './event-table.translations';

interface EventTableProps {
  events: EventLike[];
  showPerson?: boolean;
  projectId: string;
  page: number;
  onPageChange: (page: number) => void;
  hasMore: boolean;
  className?: string;
}

export function EventTable({
  events,
  showPerson = false,
  projectId,
  page,
  onPageChange,
  hasMore,
  className,
}: EventTableProps) {
  const { link } = useAppNavigate();
  const { t } = useLocalTranslation(translations);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const { data: definitions = [] } = useEventDefinitions();
  const eventDescriptions = useMemo(() => buildDescriptionMap(definitions), [definitions]);

  const handleExpandToggle = useCallback(
    (key: string) => setExpandedRow((prev) => (prev === key ? null : key)),
    [],
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      setExpandedRow(null);
      onPageChange(newPage);
    },
    [onPageChange],
  );

  const columns = useMemo<Column<EventLike>[]>(() => {
    const cols: Column<EventLike>[] = [
      {
        key: 'chevron',
        header: '',
        className: 'w-5 px-0 pl-4 py-2.5',
        headerClassName: 'w-5 px-0 pl-4',
        render: (row) => (
          <span className="flex items-center text-muted-foreground/60">
            {expandedRow === row.event_id
              ? <ChevronDown className="h-3 w-3" />
              : <ChevronRight className="h-3 w-3" />}
          </span>
        ),
      },
      {
        key: 'event',
        header: t('event'),
        className: 'px-0 py-2.5 max-w-0 w-full overflow-hidden',
        headerClassName: 'px-0',
        render: (row) => {
          const urlDisplay = (() => {
            if (!row.url) {return row.page_path || '';}
            try { return new URL(row.url).pathname || row.url; } catch { return row.url; }
          })();
          const desc = eventDescriptions[row.event_name];

          return (
            <span className="flex items-center gap-2 min-w-0">
              <EventTypeIcon eventName={row.event_name} />
              {desc ? (
                <>
                  <span className="shrink-0 text-xs font-medium">{desc}</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{row.event_name}</span>
                </>
              ) : (
                <Badge
                  variant={eventBadgeVariant(row.event_name)}
                  className="shrink-0 font-mono text-[11px] py-0 px-1.5 h-5"
                >
                  {row.event_name}
                </Badge>
              )}
              {urlDisplay && (
                <span className="text-xs text-muted-foreground/70 truncate font-mono">{urlDisplay}</span>
              )}
            </span>
          );
        },
      },
    ];

    if (showPerson) {
      cols.push({
        key: 'person',
        header: t('person'),
        className: 'px-0 py-2.5',
        headerClassName: 'px-0',
        hideOnMobile: true,
        render: (row) => (
          <span className="flex items-center min-w-0">
            {projectId && row.person_id ? (
              <Link
                to={link.persons.detail(row.person_id)}
                className="text-xs text-muted-foreground font-mono truncate hover:text-foreground hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {row.distinct_id}
              </Link>
            ) : (
              <span className="text-xs text-muted-foreground font-mono truncate">{row.distinct_id}</span>
            )}
          </span>
        ),
      });
    }

    cols.push({
      key: 'when',
      header: t('when'),
      className: 'px-0 pr-4 py-2.5 whitespace-nowrap',
      headerClassName: 'px-0 pr-4 whitespace-nowrap',
      render: (row) => (
        <span
          className="flex items-center text-xs text-muted-foreground tabular-nums"
          title={formatDateTime(row.timestamp)}
        >
          {formatRelativeTime(row.timestamp)}
        </span>
      ),
    });

    return cols;
  }, [expandedRow, showPerson, projectId, t, eventDescriptions]);

  const renderExpandedRow = useCallback(
    (row: EventLike) => <EventDetail event={row} projectId={projectId} />,
    [projectId],
  );

  const emptyState = (
    <div className="flex flex-col items-center justify-center gap-1 py-12">
      <p className="text-sm text-muted-foreground">{t('noEventsFound')}</p>
    </div>
  );

  return (
    <DataTable
      columns={columns}
      data={events}
      rowKey={(row) => row.event_id}
      expandedRowKey={expandedRow ?? undefined}
      onExpandToggle={handleExpandToggle}
      renderExpandedRow={renderExpandedRow}
      emptyState={emptyState}
      page={page}
      onPageChange={handlePageChange}
      hasMore={hasMore}
      className={className}
    />
  );
}
