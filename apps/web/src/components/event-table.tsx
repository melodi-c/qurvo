import { useState } from 'react';
import { EventTableRow } from '@/components/event-detail';
import type { EventLike } from '@/components/event-detail';
import { TablePagination } from '@/components/ui/table-pagination';
import { cn } from '@/lib/utils';

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

  const gridCols = showPerson
    ? 'grid-cols-[20px_1fr_80px] lg:grid-cols-[20px_1fr_160px_80px]'
    : 'grid-cols-[20px_1fr_80px]';

  return (
    <div className={cn('rounded-lg border border-border overflow-hidden', className)}>
      <div
        className={`grid ${gridCols} gap-3 px-4 py-2.5 bg-muted/30 text-xs font-medium text-muted-foreground`}
      >
        <span />
        <span>Event</span>
        {showPerson && <span className="hidden lg:block">Person</span>}
        <span>When</span>
      </div>

      <div className="divide-y divide-border">
        {events.map((event) => (
          <EventTableRow
            key={event.event_id}
            event={event}
            expanded={expandedRow === event.event_id}
            onToggle={() =>
              setExpandedRow(expandedRow === event.event_id ? null : event.event_id)
            }
            showPerson={showPerson}
            projectId={projectId}
          />
        ))}
      </div>

      {events.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-1 py-12">
          <p className="text-sm text-muted-foreground">No events found</p>
        </div>
      )}

      <TablePagination
        page={page}
        onPageChange={onPageChange}
        hasMore={hasMore}
        className="bg-muted/10"
      />
    </div>
  );
}
