import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { StepFilter } from '@/api/generated/Api';

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

export interface PersonsFilterState {
  search: string;
  filters: StepFilter[];
}

export function usePersonsFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [filterState, setFilterState] = useState<PersonsFilterState>(() => ({
    search: searchParams.get('search') ?? '',
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

        if (filterState.search) next.set('search', filterState.search);
        else next.delete('search');

        if (filterState.filters.length > 0) next.set('filters', JSON.stringify(filterState.filters));
        else next.delete('filters');

        return next;
      }, { replace: true });
    }, 400);

    return () => clearTimeout(timerRef.current);
  }, [filterState, setSearchParams]);

  const handleSearchChange = useCallback((search: string) => {
    setFilterState((s) => ({ ...s, search }));
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
    handleSearchChange,
    handleFiltersChange,
  };
}
