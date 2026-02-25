import { useState, useCallback, useMemo } from 'react';
import { useProjectId } from '@/hooks/use-project-id';
import { daysAgoIso, todayIso } from '@/lib/date-utils';
import type { StepFilter } from '@/api/generated/Api';

export function useWebAnalyticsParams() {
  const projectId = useProjectId();

  const [dateFrom, setDateFrom] = useState(daysAgoIso(7));
  const [dateTo, setDateTo] = useState(todayIso());
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
