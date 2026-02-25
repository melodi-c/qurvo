import { useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useProjectId } from '@/hooks/use-project-id';
import { daysAgoIso, todayIso } from '@/lib/date-utils';
import { useDebouncedUrlSync } from '@/hooks/use-debounced-url-sync';
import type { StepFilter } from '@/api/generated/Api';

function serializeDateRange(
  state: { dateFrom: string; dateTo: string },
  prev: URLSearchParams,
): URLSearchParams {
  const next = new URLSearchParams(prev);
  next.set('date_from', state.dateFrom);
  next.set('date_to', state.dateTo);
  return next;
}

export function useWebAnalyticsParams() {
  const projectId = useProjectId();
  const [searchParams] = useSearchParams();

  const [dateFrom, setDateFrom] = useState(() => searchParams.get('date_from') ?? daysAgoIso(7));
  const [dateTo, setDateTo] = useState(() => searchParams.get('date_to') ?? todayIso());
  const [filters, setFilters] = useState<StepFilter[]>([]);

  const dateRangeState = useMemo(() => ({ dateFrom, dateTo }), [dateFrom, dateTo]);
  const serializeRef = useRef(serializeDateRange);
  useDebouncedUrlSync(dateRangeState, serializeRef.current, 400);

  const setDateRange = useCallback((from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
  }, []);

  const queryParams = useMemo(
    () => ({
      project_id: projectId,
      date_from: dateFrom,
      date_to: dateTo,
      filters: filters.length > 0 ? filters : undefined,
    }),
    [projectId, dateFrom, dateTo, filters],
  );

  return {
    projectId,
    dateFrom,
    dateTo,
    filters,
    setDateRange,
    setFilters,
    queryParams,
  };
}
