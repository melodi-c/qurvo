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
 * Shifts a date/datetime forward (positive periods) or backward (negative periods) by given granularity units.
 *
 * For 'hour' granularity the input may contain a time component ("YYYY-MM-DD HH:mm:ss")
 * and the result is returned as "YYYY-MM-DD HH:mm:ss".
 * For day/week/month the result is "YYYY-MM-DD".
 */
export function shiftDate(date: string, periods: number, granularity: 'hour' | 'day' | 'week' | 'month'): string {
  // Parse: support both "YYYY-MM-DD" and "YYYY-MM-DD HH:mm:ss"
  const isoInput = date.includes(' ') ? date.replace(' ', 'T') + 'Z' : `${date}T00:00:00Z`;
  const d = new Date(isoInput);
  switch (granularity) {
    case 'hour':
      d.setUTCHours(d.getUTCHours() + periods);
      break;
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
  if (granularity === 'hour') {
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Truncates a date/datetime to the start of its granularity bucket (Monday-based weeks).
 *
 * For 'hour' granularity the input may contain a time component ("YYYY-MM-DD HH:mm:ss")
 * and the result is returned as "YYYY-MM-DD HH:00:00" (minutes/seconds zeroed).
 * For day/week/month the result is "YYYY-MM-DD".
 */
export function truncateDate(date: string, granularity: 'hour' | 'day' | 'week' | 'month'): string {
  const isoInput = date.includes(' ') ? date.replace(' ', 'T') + 'Z' : `${date}T00:00:00Z`;
  const d = new Date(isoInput);
  switch (granularity) {
    case 'hour':
      d.setUTCMinutes(0, 0, 0);
      break;
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
  if (granularity === 'hour') {
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Regex for relative date strings: -Nd, -Ny, mStart, yStart.
 * Matches: '-7d', '-30d', '-90d', '-180d', '-1y', 'mStart', 'yStart'
 */
const RELATIVE_DATE_REGEX = /^-(\d+)([dy])$/;
const RELATIVE_ANCHORS = new Set(['mStart', 'yStart']);

/**
 * Returns true when the value looks like a relative date token
 * (e.g. `-7d`, `-1y`, `mStart`, `yStart`).
 */
export function isRelativeDate(value: string): boolean {
  return RELATIVE_DATE_REGEX.test(value) || RELATIVE_ANCHORS.has(value);
}

/**
 * Resolves a relative date string to an absolute `YYYY-MM-DD` value.
 *
 * Supported formats:
 *  - `-Nd`  → N days ago
 *  - `-Ny`  → N×365 days ago
 *  - `mStart` → first day of the current month
 *  - `yStart` → first day of the current year
 *  - `YYYY-MM-DD` → returned as-is (passthrough)
 *
 * When `timezone` is provided the "today" anchor is computed in that
 * timezone; otherwise UTC is used.
 */
export function resolveRelativeDate(value: string, timezone?: string): string {
  // Absolute date passthrough
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  // Determine "today" in the requested timezone
  const now = new Date();
  let today: Date;
  if (timezone && timezone !== 'UTC') {
    // Resolve local date parts via Intl — avoids pulling in a date lib
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const y = Number(parts.find(p => p.type === 'year')?.value ?? '0');
    const m = Number(parts.find(p => p.type === 'month')?.value ?? '1');
    const d = Number(parts.find(p => p.type === 'day')?.value ?? '1');
    today = new Date(Date.UTC(y, m - 1, d));
  } else {
    today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  // Anchors
  if (value === 'mStart') {
    today.setUTCDate(1);
    return today.toISOString().slice(0, 10);
  }
  if (value === 'yStart') {
    today.setUTCMonth(0, 1);
    return today.toISOString().slice(0, 10);
  }

  // Relative offset: -Nd or -Ny
  const match = RELATIVE_DATE_REGEX.exec(value);
  if (!match) {
    throw new Error(`Invalid relative date format: ${value}`);
  }

  const amount = Number(match[1]);
  const unit = match[2];

  if (unit === 'd') {
    today.setUTCDate(today.getUTCDate() - amount);
  } else if (unit === 'y') {
    today.setUTCDate(today.getUTCDate() - amount * 365);
  }

  return today.toISOString().slice(0, 10);
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
export function tsParam(value: string, tz: string): Expr {
  const hasTz = tz !== 'UTC';
  const chTs = toChTs(value);
  if (!hasTz) {
    return param('DateTime64(3)', chTs);
  }
  return toDateTime64(param('String', chTs), literal(3), param('String', tz));
}

/**
 * Returns an AND expression for `timestamp >= from AND timestamp <= to` with timezone handling.
 */
export function timeRange(from: string, to: string, tz: string): Expr {
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
export function bucket(granularity: Granularity, column: string, tz: string): WithAs {
  const hasTz = tz !== 'UTC';
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
  tz: string,
): Expr {
  const hasTz = tz !== 'UTC';
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
export function bucketOfMin(granularity: Granularity, column: string, tz: string): WithAs {
  return bucket(granularity, `min(${column})`, tz);
}



