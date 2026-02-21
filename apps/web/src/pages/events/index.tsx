import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { List } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { EventTable } from '@/components/event-table';
import { api } from '@/api/client';
import { useDebounce } from '@/hooks/use-debounce';
import { EventsFilterPanel } from './EventsFilterPanel';
import type { StepFilter } from '@/api/generated/Api';

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

interface EventsFilterState {
  eventName: string;
  dateFrom: string;
  dateTo: string;
  filters: StepFilter[];
}

export default function EventsPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';

  const [filterState, setFilterState] = useState<EventsFilterState>({
    eventName: '',
    dateFrom: daysAgo(7),
    dateTo: new Date().toISOString().slice(0, 10),
    filters: [],
  });
  const [page, setPage] = useState(0);
  const limit = 50;

  const debouncedFilters = useDebounce(filterState, 400);

  const filtersHash = useMemo(
    () => JSON.stringify(debouncedFilters),
    [debouncedFilters],
  );

  const { data: events, isLoading } = useQuery({
    queryKey: ['events', projectId, filtersHash, page],
    queryFn: () => {
      const validFilters = debouncedFilters.filters.filter((f) => {
        if (f.property.trim() === '') return false;
        const needsValue = !['is_set', 'is_not_set'].includes(f.operator);
        if (needsValue && (!f.value || f.value.trim() === '')) return false;
        return true;
      });
      return api.analyticsControllerGetEvents({
        project_id: projectId,
        ...(debouncedFilters.eventName ? { event_name: debouncedFilters.eventName } : {}),
        date_from: debouncedFilters.dateFrom,
        date_to: debouncedFilters.dateTo,
        ...(validFilters.length ? { filters: validFilters } : {}),
        limit,
        offset: page * limit,
      });
    },
    enabled: !!projectId,
  });

  const handleEventNameChange = useCallback((eventName: string) => {
    setFilterState((s) => ({ ...s, eventName }));
    setPage(0);
  }, []);

  const handleDateChange = useCallback((dateFrom: string, dateTo: string) => {
    setFilterState((s) => ({ ...s, dateFrom, dateTo }));
    setPage(0);
  }, []);

  const handleFiltersChange = useCallback((filters: StepFilter[]) => {
    setFilterState((s) => ({ ...s, filters }));
    setPage(0);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Events" />

      {!projectId && (
        <EmptyState icon={List} description="Select a project to explore events" />
      )}

      {projectId && (
        <>
          <EventsFilterPanel
            eventName={filterState.eventName}
            onEventNameChange={handleEventNameChange}
            dateFrom={filterState.dateFrom}
            dateTo={filterState.dateTo}
            onDateChange={handleDateChange}
            filters={filterState.filters}
            onFiltersChange={handleFiltersChange}
          />

          {isLoading && <ListSkeleton count={8} height="h-9" className="space-y-2" />}

          {!isLoading && (
            <EventTable
              events={events ?? []}
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
