import { useState, useCallback, useMemo } from 'react';
import { useProjectId } from '@/hooks/use-project-id';
import type { StepFilter } from '@/api/generated/Api';

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function useWebAnalyticsParams() {
  const projectId = useProjectId();

  const [dateFrom, setDateFrom] = useState(daysAgo(7));
  const [dateTo, setDateTo] = useState(todayStr());
  const [filters, setFilters] = useState<StepFilter[]>([]);

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
