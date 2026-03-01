import type { AliasExpr, Expr } from '@qurvo/ch-query';
import {
  add,
  and,
  col,
  gte,
  interval,
  literal,
  lte,
  param,
  sub,
  toDateTime,
  toDateTime64,
  toStartOfDay,
  toStartOfHour,
  toStartOfMonth,
  toStartOfWeek,
} from '@qurvo/ch-query';

type WithAs = Expr & { as(alias: string): AliasExpr };

export type Granularity = 'hour' | 'day' | 'week' | 'month';

/**
 * Converts an ISO date/datetime string to a ClickHouse-compatible datetime string.
 *
 * When `tz` is provided and `iso` is a date-only string (YYYY-MM-DD), returns a
 * local-time string like `'2026-02-27 00:00:00'` (or `'2026-02-27 23:59:59'` for
 * end-of-day). ClickHouse will interpret this via `toDateTime64({param:String}, 3, {tz:String})`.
 *
 * Without `tz` the behaviour is unchanged: UTC wall-clock time is returned.
 */
export function toChTs(iso: string, endOfDay = false): string {
  if (iso.length === 10) {
    if (endOfDay) {return `${iso} 23:59:59`;}
    return `${iso} 00:00:00`;
  }
  const hasTimezone = iso.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(iso);
  if (hasTimezone) {
    const utc = new Date(iso).toISOString();
    return utc.slice(0, 19).replace('T', ' ');
  }
  return iso.slice(0, 19).replace('T', ' ');
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

export function shiftPeriod(dateFrom: string, dateTo: string): { from: string; to: string } {
  const from = new Date(`${dateFrom}T00:00:00Z`);
  const to = new Date(`${dateTo}T00:00:00Z`);
  const durationDays = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  const prevTo = new Date(from.getTime() - 86400000);
  const prevFrom = new Date(from.getTime() - durationDays * 86400000);
  return {
    from: prevFrom.toISOString().slice(0, 10),
    to: prevTo.toISOString().slice(0, 10),
  };
}

/**
 * Returns a ParamExpr for datetime comparison with timezone-awareness.
 *
 * UTC:  {p_N:DateTime64(3)}
 * TZ:   toDateTime64({p_N:String}, 3, {p_M:String})
 */
export function tsParam(value: string, tz?: string): Expr {
  const hasTz = !!(tz && tz !== 'UTC');
  const chTs = toChTs(value);
  if (!hasTz) {
    return param('DateTime64(3)', chTs);
  }
  return toDateTime64(param('String', chTs), literal(3), param('String', tz));
}

/**
 * Returns an AND expression for `timestamp >= from AND timestamp <= to` with timezone handling.
 */
export function timeRange(from: string, to: string, tz?: string): Expr {
  const fromExpr = tsParam(from, tz);
  const toExpr = tsParam(to.length === 10 ? toChTs(to, true) : to, tz);
  return and(
    gte(col('timestamp'), fromExpr),
    lte(col('timestamp'), toExpr),
  );
}

/**
 * Granularity truncation expression: toStartOfDay/Week/Month with timezone.
 *
 * - hour: toStartOfHour(col [, tz])
 * - day: toStartOfDay(col [, tz])
 * - week: toDateTime(toStartOfWeek(col, 1 [, tz]) [, tz])  -- toStartOfWeek returns Date
 * - month: toDateTime(toStartOfMonth(col [, tz]) [, tz])    -- toStartOfMonth returns Date
 */
export function bucket(granularity: Granularity, column: string, tz?: string): WithAs {
  const hasTz = !!(tz && tz !== 'UTC');
  const colExpr = col(column);

  const tzExpr = hasTz ? literal(tz) : undefined;

  switch (granularity) {
    case 'hour':
      return toStartOfHour(colExpr, tzExpr);
    case 'day':
      return toStartOfDay(colExpr, tzExpr);
    case 'week':
      return hasTz
        ? toDateTime(toStartOfWeek(colExpr, literal(1), tzExpr), literal(tz))
        : toDateTime(toStartOfWeek(colExpr, literal(1)));
    case 'month':
      return hasTz
        ? toDateTime(toStartOfMonth(colExpr, tzExpr), literal(tz))
        : toDateTime(toStartOfMonth(colExpr));
    default: {
      const _exhaustive: never = granularity;
      throw new Error(`Unhandled granularity: ${_exhaustive}`);
    }
  }
}

/**
 * DST-safe neighbor bucket:
 * - day: bucketExpr +/- INTERVAL 1 DAY (safe, no sub-day offsets)
 * - week/month + tz: re-snap to local-time boundary after shift
 *     toDateTime(toStartOfWeek(shifted, 1, tz), tz)
 * - week/month no tz or day: simple arithmetic
 */
export function neighborBucket(
  granularity: Granularity,
  bucketExpr: Expr,
  direction: 1 | -1,
  tz?: string,
): Expr {
  const hasTz = !!(tz && tz !== 'UTC');
  const ivl = granularity === 'week' ? interval(7, 'DAY')
    : granularity === 'month' ? interval(1, 'MONTH')
    : interval(1, 'DAY');
  const shifted = direction === 1 ? add(bucketExpr, ivl) : sub(bucketExpr, ivl);

  if (!hasTz || granularity === 'hour' || granularity === 'day') {
    return shifted;
  }

  switch (granularity) {
    case 'week':
      return toDateTime(toStartOfWeek(shifted, literal(1), literal(tz)), literal(tz));
    case 'month':
      return toDateTime(toStartOfMonth(shifted, literal(tz)), literal(tz));
    default: {
      const _exhaustive: never = granularity;
      throw new Error(`Unhandled granularity: ${_exhaustive}`);
    }
  }
}

/**
 * Granularity truncation of min(col) -- for projection optimization.
 * min(toStartOfDay(t)) == toStartOfDay(min(t))
 */
export function bucketOfMin(granularity: Granularity, column: string, tz?: string): WithAs {
  return bucket(granularity, `min(${column})`, tz);
}



