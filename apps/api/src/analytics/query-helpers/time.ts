import type { AliasExpr, Expr } from '@qurvo/ch-query';
import { and, col, func, gte, literal, lte, param, raw } from '@qurvo/ch-query';

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
  return func('toDateTime64', param('String', chTs), literal(3), param('String', tz));
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

  switch (granularity) {
    case 'hour':
      return hasTz
        ? func('toStartOfHour', colExpr, literal(tz!))
        : func('toStartOfHour', colExpr);
    case 'day':
      return hasTz
        ? func('toStartOfDay', colExpr, literal(tz!))
        : func('toStartOfDay', colExpr);
    case 'week':
      return hasTz
        ? func('toDateTime', func('toStartOfWeek', colExpr, literal(1), literal(tz!)), literal(tz!))
        : func('toDateTime', func('toStartOfWeek', colExpr, literal(1)));
    case 'month':
      return hasTz
        ? func('toDateTime', func('toStartOfMonth', colExpr, literal(tz!)), literal(tz!))
        : func('toDateTime', func('toStartOfMonth', colExpr));
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
  const interval = granularity === 'week' ? 'INTERVAL 7 DAY'
    : granularity === 'month' ? 'INTERVAL 1 MONTH'
    : 'INTERVAL 1 DAY';
  const op = direction === 1 ? '+' : '-';
  const shifted = raw(`(${compileExprInline(bucketExpr)} ${op} ${interval})`);

  if (!hasTz || granularity === 'hour' || granularity === 'day') {
    return shifted;
  }

  switch (granularity) {
    case 'week':
      return func('toDateTime', func('toStartOfWeek', shifted, literal(1), literal(tz!)), literal(tz!));
    case 'month':
      return func('toDateTime', func('toStartOfMonth', shifted, literal(tz!)), literal(tz!));
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

/**
 * Inline expression serializer for use within raw() expressions.
 * Only handles simple cases needed by neighborBucket.
 */
function compileExprInline(expr: Expr): string {
  switch (expr.type) {
    case 'raw':
      return expr.sql;
    case 'raw_with_params':
      return expr.sql;
    case 'column':
      return expr.name;
    case 'literal':
      if (typeof expr.value === 'string') return `'${expr.value.replace(/'/g, "\\'")}'`;
      if (typeof expr.value === 'boolean') return expr.value ? '1' : '0';
      return String(expr.value);
    case 'func': {
      const args = expr.args.map(compileExprInline).join(', ');
      return `${expr.name}(${args})`;
    }
    case 'alias':
      return compileExprInline(expr.expr);
    case 'binary':
      return `${compileExprInline(expr.left)} ${expr.op} ${compileExprInline(expr.right)}`;
    default:
      // For complex cases, fall back to a placeholder
      throw new Error(`Cannot inline expression of type: ${expr.type}`);
  }
}

// ── String-returning helpers for raw SQL consumers ──────────────────────────

/**
 * Returns a raw SQL string for granularity truncation.
 * Thin wrapper around bucket() that serializes the AST to SQL.
 *
 * Used by consumers that build queries via template literals (web-analytics, etc.)
 */
export function granularityTruncExpr(granularity: Granularity, col: string, tz?: string): string {
  return compileExprInline(bucket(granularity, col, tz));
}

/**
 * Returns the granularity-truncated minimum of a column as a raw SQL string.
 * granularityTruncExpr(granularity, `min(col)`, tz)
 */
export function granularityTruncMinExpr(granularity: Granularity, col: string, tz?: string): string {
  return granularityTruncExpr(granularity, `min(${col})`, tz);
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

/**
 * Returns the SQL expression to compare `timestamp` against a named datetime parameter.
 *
 * - Without timezone: `{paramName:DateTime64(3)}`
 * - With timezone: `toDateTime64({paramName:String}, 3, {tzParam:String})`
 */
export function tsExpr(paramName: string, tzParam: string, hasTz: boolean): string {
  return hasTz
    ? `toDateTime64({${paramName}:String}, 3, {${tzParam}:String})`
    : `{${paramName}:DateTime64(3)}`;
}

/**
 * Returns a DST-safe ClickHouse expression for the neighbor bucket as a raw SQL string.
 */
export function granularityNeighborExpr(
  granularity: 'day' | 'week' | 'month',
  bucketExpr: string,
  direction: 1 | -1,
  tz?: string,
): string {
  const hasTz = !!(tz && tz !== 'UTC');
  const interval = granularityInterval(granularity);
  const shifted = direction === 1 ? `${bucketExpr} + ${interval}` : `${bucketExpr} - ${interval}`;

  if (!hasTz || granularity === 'day') {
    return shifted;
  }

  switch (granularity) {
    case 'week':
      return `toDateTime(toStartOfWeek(${shifted}, 1, '${tz}'), '${tz}')`;
    case 'month':
      return `toDateTime(toStartOfMonth(${shifted}, '${tz}'), '${tz}')`;
    default: {
      const _exhaustive: never = granularity;
      throw new Error(`Unhandled granularity: ${_exhaustive}`);
    }
  }
}

/**
 * Builds a SQL filter clause from an array of conditions.
 * Returns ' AND cond1 AND cond2 ...' when conditions are present, or '' when empty.
 */
export function buildFilterClause(conditions: string[]): string {
  return conditions.length > 0 ? ' AND ' + conditions.join(' AND ') : '';
}
