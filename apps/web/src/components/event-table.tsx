import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/ui/data-table';
import {
  EventDetail,
  EventTypeIcon,
  eventBadgeVariant,
  formatRelativeTime,
  type EventLike,
} from '@/components/event-detail';

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
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

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
        header: 'Event',
        className: 'px-0 py-2.5',
        headerClassName: 'px-0',
        render: (row) => {
          const urlDisplay = (() => {
            if (!row.url) return row.page_path || '';
            try { return new URL(row.url).pathname || row.url; } catch { return row.url; }
          })();

          return (
            <span className="flex items-center gap-2 min-w-0">
              <EventTypeIcon eventName={row.event_name} />
              <Badge
                variant={eventBadgeVariant(row.event_name)}
                className="shrink-0 font-mono text-[11px] py-0 px-1.5 h-5"
              >
                {row.event_name}
              </Badge>
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
        header: 'Person',
        className: 'px-0 py-2.5',
        headerClassName: 'px-0',
        hideOnMobile: true,
        render: (row) => (
          <span className="flex items-center min-w-0">
            {projectId && row.person_id ? (
              <Link
                to={`/persons/${row.person_id}?project=${projectId}`}
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
      header: 'When',
      className: 'px-0 pr-4 py-2.5',
      headerClassName: 'px-0 pr-4',
      render: (row) => (
        <span
          className="flex items-center text-xs text-muted-foreground tabular-nums"
          title={new Date(row.timestamp).toLocaleString()}
        >
          {formatRelativeTime(row.timestamp)}
        </span>
      ),
    });

    return cols;
  }, [expandedRow, showPerson, projectId]);

  const renderExpandedRow = useCallback(
    (row: EventLike) => <EventDetail event={row} projectId={projectId} />,
    [projectId],
  );

  const emptyState = (
    <div className="flex flex-col items-center justify-center gap-1 py-12">
      <p className="text-sm text-muted-foreground">No events found</p>
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
