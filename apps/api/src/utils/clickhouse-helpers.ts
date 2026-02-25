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
    case 'week':  return `toDateTime(toStartOfWeek(${col}, 1))`;
    case 'month': return `toDateTime(toStartOfMonth(${col}))`;
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

/**
 * Shifts a date forward (positive periods) or backward (negative periods) by given granularity units.
 */
export function shiftDate(date: string, periods: number, granularity: 'day' | 'week' | 'month'): string {
  const d = new Date(`${date}T00:00:00Z`);
  switch (granularity) {
    case 'day':
      d.setUTCDate(d.getUTCDate() + periods);
      break;
    case 'week':
      d.setUTCDate(d.getUTCDate() + periods * 7);
      break;
    case 'month':
      d.setUTCMonth(d.getUTCMonth() + periods);
      break;
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Truncates a date to the start of its granularity bucket (Monday-based weeks).
 */
export function truncateDate(date: string, granularity: 'day' | 'week' | 'month'): string {
  const d = new Date(`${date}T00:00:00Z`);
  switch (granularity) {
    case 'day':
      break;
    case 'week': {
      const day = d.getUTCDay();
      const diff = day === 0 ? 6 : day - 1;
      d.setUTCDate(d.getUTCDate() - diff);
      break;
    }
    case 'month':
      d.setUTCDate(1);
      break;
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Returns a ClickHouse INTERVAL expression for a given granularity.
 */
export function granularityInterval(granularity: 'day' | 'week' | 'month'): string {
  switch (granularity) {
    case 'day': return `INTERVAL 1 DAY`;
    case 'week': return `INTERVAL 7 DAY`;
    case 'month': return `INTERVAL 1 MONTH`;
  }
}
