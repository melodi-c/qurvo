import { useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { StepFilter } from '@/api/generated/Api';
import { parseFilters } from '@/lib/filter-utils';
import { useDebouncedUrlSync } from '@/hooks/use-debounced-url-sync';

export interface EventsFilterState {
  eventName: string;
  filters: StepFilter[];
}

function serializeEventsFilters(state: EventsFilterState, prev: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(prev);

  if (state.eventName) {next.set('event', state.eventName);}
  else {next.delete('event');}

  if (state.filters.length > 0) {next.set('filters', JSON.stringify(state.filters));}
  else {next.delete('filters');}

  return next;
}

export function useEventsFilters() {
  const [searchParams] = useSearchParams();

  const [filterState, setFilterState] = useState<EventsFilterState>(() => ({
    eventName: searchParams.get('event') ?? '',
    filters: parseFilters(searchParams.get('filters')),
  }));

  const [page, setPage] = useState(0);

  const serializeRef = useRef(serializeEventsFilters);
  useDebouncedUrlSync(filterState, serializeRef.current, 400);

  const handleEventNameChange = useCallback((eventName: string) => {
    setFilterState((s) => ({ ...s, eventName }));
    setPage(0);
  }, []);

  const handleFiltersChange = useCallback((filters: StepFilter[]) => {
    setFilterState((s) => ({ ...s, filters }));
    setPage(0);
  }, []);

  return {
    filterState,
    page,
    setPage,
    handleEventNameChange,
    handleFiltersChange,
  };
}
