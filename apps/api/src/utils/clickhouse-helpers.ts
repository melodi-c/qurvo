import { buildCohortFilterClause, type CohortFilterInput } from '@qurvo/cohort-query';

export function toChTs(iso: string, endOfDay = false): string {
  if (iso.length === 10 && endOfDay) return `${iso} 23:59:59`;
  return iso.replace('T', ' ').replace('Z', '');
}

export { RESOLVED_PERSON } from '@qurvo/cohort-query';

export type Granularity = 'hour' | 'day' | 'week' | 'month';

export function granularityTruncExpr(granularity: Granularity, col: string): string {
  switch (granularity) {
    case 'hour':  return `toStartOfHour(${col})`;
    case 'day':   return `toStartOfDay(${col})`;
    case 'week':  return `toStartOfWeek(${col}, 1)`;
    case 'month': return `toStartOfMonth(${col})`;
  }
}

export function shiftPeriod(dateFrom: string, dateTo: string): { from: string; to: string } {
  const from = new Date(dateFrom);
  const to = new Date(`${dateTo}T23:59:59Z`);
  const durationMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1000);
  const prevFrom = new Date(from.getTime() - durationMs - 1000);
  return {
    from: prevFrom.toISOString().slice(0, 10),
    to: prevTo.toISOString().slice(0, 10),
  };
}

export function buildCohortClause(
  cohortFilters: CohortFilterInput[] | undefined,
  projectIdParam: string,
  queryParams: Record<string, unknown>,
): string {
  if (!cohortFilters?.length) return '';
  return ' AND ' + buildCohortFilterClause(cohortFilters, projectIdParam, queryParams);
}
