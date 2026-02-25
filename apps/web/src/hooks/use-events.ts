import { useQuery } from '@tanstack/react-query';
import { useProjectId } from '@/hooks/use-project-id';
import { useDebouncedHash } from '@/hooks/use-debounced-hash';
import { isValidFilter } from '@/lib/filter-utils';
import { api } from '@/api/client';
import type { EventsFilterState } from '@/pages/events/use-events-filters';

const LIMIT = 50;

export function useEvents(filterState: EventsFilterState, page: number) {
  const projectId = useProjectId();

  const { debounced: debouncedFilters, hash: filtersHash } = useDebouncedHash(filterState, 400);

  const { data: events, isLoading, isError } = useQuery({
    queryKey: ['events', projectId, filtersHash, page],
    queryFn: () => {
      const validFilters = debouncedFilters.filters.filter(isValidFilter);
      return api.eventsControllerGetEvents({
        project_id: projectId,
        ...(debouncedFilters.eventName ? { event_name: debouncedFilters.eventName } : {}),
        date_from: debouncedFilters.dateFrom,
        date_to: debouncedFilters.dateTo,
        ...(validFilters.length ? { filters: validFilters } : {}),
        limit: LIMIT,
        offset: page * LIMIT,
      });
    },
    enabled: !!projectId,
  });

  return {
    projectId,
    events,
    isLoading,
    isError,
    limit: LIMIT,
  };
}
