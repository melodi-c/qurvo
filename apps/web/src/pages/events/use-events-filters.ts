import { useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { StepFilter } from '@/api/generated/Api';
import { daysAgoIso, todayIso } from '@/lib/date-utils';
import { parseFilters } from '@/lib/filter-utils';
import { useDebouncedUrlSync } from '@/hooks/use-debounced-url-sync';

export interface EventsFilterState {
  eventName: string;
  dateFrom: string;
  dateTo: string;
  filters: StepFilter[];
}

function serializeEventsFilters(state: EventsFilterState, prev: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(prev);

  if (state.eventName) {next.set('event', state.eventName);}
  else {next.delete('event');}

  next.set('from', state.dateFrom);
  next.set('to', state.dateTo);

  if (state.filters.length > 0) {next.set('filters', JSON.stringify(state.filters));}
  else {next.delete('filters');}

  return next;
}

export function useEventsFilters() {
  const [searchParams] = useSearchParams();

  const [filterState, setFilterState] = useState<EventsFilterState>(() => ({
    eventName: searchParams.get('event') ?? '',
    dateFrom: searchParams.get('from') ?? daysAgoIso(7),
    dateTo: searchParams.get('to') ?? todayIso(),
    filters: parseFilters(searchParams.get('filters')),
  }));

  const [page, setPage] = useState(0);

  const serializeRef = useRef(serializeEventsFilters);
  useDebouncedUrlSync(filterState, serializeRef.current, 400);

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

  return {
    filterState,
    page,
    setPage,
    handleEventNameChange,
    handleDateChange,
    handleFiltersChange,
  };
}
