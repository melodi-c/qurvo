import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useProjectId } from '@/hooks/use-project-id';
import { List } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { EventTable } from '@/components/event-table';
import { api } from '@/api/client';
import { useDebounce } from '@/hooks/use-debounce';
import { isValidFilter } from '@/lib/filter-utils';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './index.translations';
import { EventsFilterPanel } from './EventsFilterPanel';
import { useEventsFilters } from './use-events-filters';

export default function EventsPage() {
  const { t } = useLocalTranslation(translations);
  const projectId = useProjectId();

  const {
    filterState,
    page,
    setPage,
    handleEventNameChange,
    handleDateChange,
    handleFiltersChange,
  } = useEventsFilters();

  const limit = 50;

  const debouncedFilters = useDebounce(filterState, 400);

  const filtersHash = useMemo(
    () => JSON.stringify(debouncedFilters),
    [debouncedFilters],
  );

  const { data: events, isLoading } = useQuery({
    queryKey: ['events', projectId, filtersHash, page],
    queryFn: () => {
      const validFilters = debouncedFilters.filters.filter(isValidFilter);
      return api.eventsControllerGetEvents({
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

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />

      {!projectId && (
        <EmptyState icon={List} description={t('selectProject')} />
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
