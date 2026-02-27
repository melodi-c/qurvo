import { buildCohortFilterClause, type CohortFilterInput } from '@qurvo/cohort-query';

/**
 * Converts an ISO date/datetime string to a ClickHouse-compatible datetime string.
 *
 * When `tz` is provided and `iso` is a date-only string (YYYY-MM-DD), returns a
 * local-time string like `'2026-02-27 00:00:00'` (or `'2026-02-27 23:59:59'` for
 * end-of-day). ClickHouse will interpret this via `toDateTime64({param:String}, 3, {tz:String})`.
 *
 * Without `tz` the behaviour is unchanged: UTC wall-clock time is returned.
 */
export function toChTs(iso: string, endOfDay = false, tz?: string): string {
  if (iso.length === 10) {
    // Date-only input — no timezone conversion needed in Node.js.
    // ClickHouse handles the timezone interpretation via toDateTime64(..., tz).
    if (endOfDay) return `${iso} 23:59:59`;
    return `${iso} 00:00:00`;
  }
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

export function granularityTruncExpr(granularity: Granularity, col: string, tz?: string): string {
  const hastz = tz && tz !== 'UTC';
  switch (granularity) {
    case 'hour':
      return hastz ? `toStartOfHour(${col}, '${tz}')` : `toStartOfHour(${col})`;
    case 'day':
      return hastz ? `toStartOfDay(${col}, '${tz}')` : `toStartOfDay(${col})`;
    case 'week':
      // toStartOfWeek returns Date; wrap with toDateTime to get DateTime.
      // With timezone: toStartOfWeek(col, 1, tz) → Date → toDateTime(..., tz) → DateTime
      return hastz
        ? `toDateTime(toStartOfWeek(${col}, 1, '${tz}'), '${tz}')`
        : `toDateTime(toStartOfWeek(${col}, 1))`;
    case 'month':
      // toStartOfMonth returns Date; wrap with toDateTime to get DateTime.
      return hastz
        ? `toDateTime(toStartOfMonth(${col}, '${tz}'), '${tz}')`
        : `toDateTime(toStartOfMonth(${col}))`;
    default: {
      const _exhaustive: never = granularity;
      throw new Error(`Unhandled granularity: ${_exhaustive}`);
    }
  }
}

export function shiftPeriod(dateFrom: string, dateTo: string): { from: string; to: string } {
  const from = new Date(`${dateFrom}T00:00:00Z`);
  const to = new Date(`${dateTo}T00:00:00Z`);
  // Calculate inclusive duration in whole days
  const durationDays = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  // Previous period ends the day before current period starts
  const prevTo = new Date(from.getTime() - 86400000);
  // Previous period has the same number of days
  const prevFrom = new Date(from.getTime() - durationDays * 86400000);
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
 * Returns the SQL expression to compare `timestamp` against a named datetime parameter.
 *
 * - Without timezone: `{paramName:DateTime64(3)}` — param value must be a UTC datetime string.
 * - With timezone: `toDateTime64({paramName:String}, 3, {tzParam:String})` — ClickHouse interprets
 *   the local-time string using the timezone value stored in `{tzParam}`.
 *
 * @param paramName - the ClickHouse query parameter name for the datetime value (e.g. 'from', 'to')
 * @param tzParam   - the ClickHouse query parameter name for the timezone string (e.g. 'tz')
 * @param hasTz     - whether timezone-aware mode should be used
 */
export function tsExpr(paramName: string, tzParam: string, hasTz: boolean): string {
  return hasTz
    ? `toDateTime64({${paramName}:String}, 3, {${tzParam}:String})`
    : `{${paramName}:DateTime64(3)}`;
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
