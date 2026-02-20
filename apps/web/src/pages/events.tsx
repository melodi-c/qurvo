import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { List } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { EventTable } from '@/components/event-table';
import { api } from '@/api/client';
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
            <EventTable
              events={(events ?? []).map(toEventLike)}
              showPerson
              projectId={projectId}
              page={page}
              onPageChange={setPage}
              hasMore={(events ?? []).length >= limit}
            />
          )}
        </>
      )}
    </div>
  );
}
