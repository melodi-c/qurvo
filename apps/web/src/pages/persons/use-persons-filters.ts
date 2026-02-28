import { useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { StepFilter } from '@/api/generated/Api';
import { parseFilters } from '@/lib/filter-utils';
import { useDebouncedUrlSync } from '@/hooks/use-debounced-url-sync';

export interface PersonsFilterState {
  search: string;
  filters: StepFilter[];
}

function serializePersonsFilters(state: PersonsFilterState, prev: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(prev);

  if (state.search) {next.set('search', state.search);}
  else {next.delete('search');}

  if (state.filters.length > 0) {next.set('filters', JSON.stringify(state.filters));}
  else {next.delete('filters');}

  return next;
}

export function usePersonsFilters() {
  const [searchParams] = useSearchParams();

  const [filterState, setFilterState] = useState<PersonsFilterState>(() => ({
    search: searchParams.get('search') ?? '',
    filters: parseFilters(searchParams.get('filters')),
  }));

  const [page, setPage] = useState(0);

  const serializeRef = useRef(serializePersonsFilters);
  useDebouncedUrlSync(filterState, serializeRef.current, 400);

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
