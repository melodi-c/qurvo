import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { StepFilter } from '@/api/generated/Api';

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseFilters(raw: string | null): StepFilter[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export interface EventsFilterState {
  eventName: string;
  dateFrom: string;
  dateTo: string;
  filters: StepFilter[];
}

export function useEventsFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [filterState, setFilterState] = useState<EventsFilterState>(() => ({
    eventName: searchParams.get('event') ?? '',
    dateFrom: searchParams.get('from') ?? daysAgo(7),
    dateTo: searchParams.get('to') ?? today(),
    filters: parseFilters(searchParams.get('filters')),
  }));

  const [page, setPage] = useState(0);

  // Debounced URL sync
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);

        if (filterState.eventName) next.set('event', filterState.eventName);
        else next.delete('event');

        next.set('from', filterState.dateFrom);
        next.set('to', filterState.dateTo);

        if (filterState.filters.length > 0) next.set('filters', JSON.stringify(filterState.filters));
        else next.delete('filters');

        return next;
      }, { replace: true });
    }, 400);

    return () => clearTimeout(timerRef.current);
  }, [filterState, setSearchParams]);

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
