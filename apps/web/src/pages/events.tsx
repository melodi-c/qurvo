import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
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

  if (!projectId) {
    return <div className="text-muted-foreground">Select a project first</div>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Event Explorer</h1>

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

      <Card className="py-0 gap-0">
        <CardContent className="p-0">
          {isLoading && (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          )}

          {!isLoading && (
            <div>
              {/* Header */}
              <div className="grid grid-cols-[20px_1fr_160px_80px] gap-3 px-4 py-2 border-b border-border text-xs font-medium text-muted-foreground">
                <span />
                <span>Event</span>
                <span>Person</span>
                <span>When</span>
              </div>

              {/* Rows */}
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

              {(events ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-12">No events found</p>
              )}

              {/* Pagination */}
              <div className="flex justify-between items-center px-4 py-3 border-t border-border">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">Page {page + 1}</span>
                <Button variant="outline" size="sm" disabled={(events ?? []).length < limit} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
