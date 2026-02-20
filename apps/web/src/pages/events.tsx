import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { List } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { TablePagination } from '@/components/ui/table-pagination';
import { api } from '@/api/client';
import { EventTableRow } from '@/components/event-detail';
import type { EventLike } from '@/components/event-detail';
import type { EventRow } from '@/api/generated/Api';

function toEventLike(e: EventRow): EventLike {
  return {
    ...e,
    screen_width: e.screen_width ?? 0,
    screen_height: e.screen_height ?? 0,
  };
}

export default function EventsPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const [filters, setFilters] = useState({ event_name: '', distinct_id: '' });
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data: events, isLoading } = useQuery({
    queryKey: ['events', projectId, filters, page],
    queryFn: () =>
      api.analyticsControllerGetEvents({
        project_id: projectId,
        ...(filters.event_name ? { event_name: filters.event_name } : {}),
        ...(filters.distinct_id ? { distinct_id: filters.distinct_id } : {}),
        limit,
        offset: page * limit,
      }),
    enabled: !!projectId,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Events" />

      {!projectId && (
        <EmptyState icon={List} description="Select a project to explore events" />
      )}

      {projectId && (
        <>
          <div className="flex gap-3">
            <Input
              placeholder="Filter by event name"
              value={filters.event_name}
              onChange={(e) => { setFilters((f) => ({ ...f, event_name: e.target.value })); setPage(0); }}
              className="max-w-xs"
            />
            <Input
              placeholder="Filter by distinct_id"
              value={filters.distinct_id}
              onChange={(e) => { setFilters((f) => ({ ...f, distinct_id: e.target.value })); setPage(0); }}
              className="max-w-xs"
            />
          </div>

          {isLoading && <ListSkeleton count={8} height="h-9" className="space-y-2" />}

          {!isLoading && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="grid grid-cols-[20px_1fr_160px_80px] gap-3 px-4 py-2.5 bg-muted/30 text-xs font-medium text-muted-foreground">
                <span />
                <span>Event</span>
                <span>Person</span>
                <span>When</span>
              </div>

              <div className="divide-y divide-border">
                {(events ?? []).map((event) => (
                  <EventTableRow
                    key={event.event_id}
                    event={toEventLike(event)}
                    expanded={expandedRow === event.event_id}
                    onToggle={() => setExpandedRow(expandedRow === event.event_id ? null : event.event_id)}
                    showPerson
                    projectId={projectId}
                  />
                ))}
              </div>

              {(events ?? []).length === 0 && (
                <div className="flex flex-col items-center justify-center gap-1 py-12">
                  <p className="text-sm text-muted-foreground">No events found</p>
                  <p className="text-xs text-muted-foreground/60">Try adjusting your filters</p>
                </div>
              )}

              <TablePagination
                page={page}
                onPageChange={setPage}
                hasMore={(events ?? []).length >= limit}
                className="bg-muted/10"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
