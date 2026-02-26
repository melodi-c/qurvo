import { buildCohortFilterClause, type CohortFilterInput } from '@qurvo/cohort-query';

export function toChTs(iso: string, endOfDay = false): string {
  if (iso.length === 10 && endOfDay) return `${iso} 23:59:59`;
  if (iso.length === 10) return iso;
  // If the string has an explicit timezone offset (+HH:MM or -HH:MM) or a Z
  // suffix we must normalise to UTC so the offset is applied correctly.
  // Without an explicit timezone the caller is already passing UTC wall-clock
  // time (e.g. from a date-only picker or a stored UTC string), so we strip
  // the T separator and any milliseconds directly without date arithmetic.
  const hasTimezone = iso.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(iso);
  if (hasTimezone) {
    const utc = new Date(iso).toISOString(); // → "YYYY-MM-DDTHH:mm:ss.mmmZ"
    return utc.slice(0, 19).replace('T', ' '); // → "YYYY-MM-DD HH:mm:ss"
  }
  // No timezone — treat as UTC wall-clock, strip T and optional milliseconds.
  return iso.slice(0, 19).replace('T', ' ');
}

export { RESOLVED_PERSON } from '@qurvo/cohort-query';

export type Granularity = 'hour' | 'day' | 'week' | 'month';

export function granularityTruncExpr(granularity: Granularity, col: string): string {
  switch (granularity) {
    case 'hour':  return `toStartOfHour(${col})`;
    case 'day':   return `toStartOfDay(${col})`;
    case 'week':  return `toDateTime(toStartOfWeek(${col}, 1))`;
    case 'month': return `toDateTime(toStartOfMonth(${col}))`;
    default: {
      const _exhaustive: never = granularity;
      throw new Error(`Unhandled granularity: ${_exhaustive}`);
    }
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
    default: {
      const _exhaustive: never = granularity;
      throw new Error(`Unhandled granularity: ${_exhaustive}`);
    }
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
    default: {
      const _exhaustive: never = granularity;
      throw new Error(`Unhandled granularity: ${_exhaustive}`);
    }
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Builds a SQL filter clause from an array of conditions.
 * Returns ' AND cond1 AND cond2 ...' when conditions are present, or '' when empty.
 */
export function buildFilterClause(conditions: string[]): string {
  return conditions.length > 0 ? ' AND ' + conditions.join(' AND ') : '';
}

/**
 * Returns a ClickHouse INTERVAL expression for a given granularity.
 */
export function granularityInterval(granularity: 'day' | 'week' | 'month'): string {
  switch (granularity) {
    case 'day': return `INTERVAL 1 DAY`;
    case 'week': return `INTERVAL 7 DAY`;
    case 'month': return `INTERVAL 1 MONTH`;
    default: {
      const _exhaustive: never = granularity;
      throw new Error(`Unhandled granularity: ${_exhaustive}`);
    }
  }
}
