import type { TrendSeriesResult } from '@/api/generated/Api';
import { resolveRelativeDate } from '@/lib/date-utils';

/** Build a display key for a series, including breakdown value when present. */
export function seriesKey(s: TrendSeriesResult): string {
  if (s.breakdown_value) {return `${s.label} (${s.breakdown_value})`;}
  return s.label;
}

/** Return the current date/time parts in the given timezone (defaults to UTC). */
function nowInTimezone(timezone?: string): { year: number; month: number; day: number; hour: number } {
  const tz = timezone || 'UTC';
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
  };
}

/** Pad a number to 2 digits. */
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Detect if a bucket falls in the current (incomplete) period.
 * Uses the project timezone to determine "now" so that the incomplete
 * marker matches the timezone-aware buckets returned by the backend. */
export function isIncompleteBucket(bucket: string, granularity?: string, timezone?: string): boolean {
  if (!granularity) {return false;}
  const tz = nowInTimezone(timezone);
  const today = `${tz.year}-${pad2(tz.month)}-${pad2(tz.day)}`;

  if (granularity === 'hour') {
    // Bucket format: "2026-02-27 14:00:00" (space separator).
    const currentHour = `${today} ${pad2(tz.hour)}`;
    return bucket.startsWith(currentHour);
  }
  if (granularity === 'day') {return bucket === today;}
  if (granularity === 'week') {
    // Both bucket and "now" are in project timezone, so compare date strings directly.
    const bucketDate = new Date(bucket.slice(0, 10) + 'T00:00:00Z');
    const nowDate = new Date(today + 'T00:00:00Z');
    const diffDays = (nowDate.getTime() - bucketDate.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays < 7;
  }
  if (granularity === 'month') {
    return bucket.slice(0, 7) === today.slice(0, 7);
  }
  return false;
}

/** Snap an annotation date (YYYY-MM-DD) to the bucket value for the given granularity.
 * Recharts ReferenceLine x must match an actual data point's bucket value exactly. */
export function snapAnnotationDateToBucket(date: string, granularity: string): string {
  if (granularity === 'hour') {
    // Hour buckets are "YYYY-MM-DD HH:00:00". An annotation only has a date, so
    // snap to midnight of that day — the first hour bucket.
    return `${date} 00:00:00`;
  }
  if (granularity === 'week') {
    // Week buckets start on Monday (ClickHouse toStartOfWeek default).
    // Find the Monday of the annotation's week.
    const d = new Date(date + 'T00:00:00Z');
    const dayOfWeek = d.getUTCDay(); // 0=Sun, 1=Mon, ...
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    d.setUTCDate(d.getUTCDate() - diffToMonday);
    return d.toISOString().slice(0, 10) + ' 00:00:00';
  }
  if (granularity === 'month') {
    // Month buckets are "YYYY-MM-01 00:00:00".
    return date.slice(0, 7) + '-01 00:00:00';
  }
  // day: bucket is "YYYY-MM-DD 00:00:00" — ClickHouse DateTime format
  return date + ' 00:00:00';
}

/** Optional date range + granularity for generating full bucket sets. */
export interface DateRangeParams {
  dateFrom: string;
  dateTo: string;
  granularity: string;
}

/**
 * Generate the full list of bucket strings for a date range and granularity.
 * Buckets are formatted to match ClickHouse output (YYYY-MM-DD for date-only
 * or YYYY-MM-DD HH:MM:SS for DateTime). If `existingSample` is provided, the
 * format is detected from it (space means DateTime); otherwise plain YYYY-MM-DD.
 */
export function generateBuckets(
  dateFrom: string,
  dateTo: string,
  granularity: string,
  existingSample?: string,
): string[] {
  const fromIso = resolveRelativeDate(dateFrom);
  const toIso = resolveRelativeDate(dateTo);

  // Detect format: if any existing bucket contains a space, use DateTime format
  const useDateTime = existingSample ? existingSample.includes(' ') : false;
  const fmt = (d: Date): string => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    if (useDateTime) {
      if (granularity === 'hour') {
        const h = String(d.getUTCHours()).padStart(2, '0');
        return `${y}-${m}-${day} ${h}:00:00`;
      }
      return `${y}-${m}-${day} 00:00:00`;
    }
    return `${y}-${m}-${day}`;
  };

  const start = new Date(fromIso + 'T00:00:00Z');
  const end = new Date(toIso + 'T00:00:00Z');
  const buckets: string[] = [];

  if (granularity === 'hour') {
    // Hour buckets: every hour from start of dateFrom to end of dateTo
    const cursor = new Date(start);
    const limit = new Date(end);
    limit.setUTCDate(limit.getUTCDate() + 1); // include all hours of dateTo
    while (cursor < limit) {
      buckets.push(fmt(cursor));
      cursor.setUTCHours(cursor.getUTCHours() + 1);
    }
  } else if (granularity === 'day') {
    const cursor = new Date(start);
    while (cursor <= end) {
      buckets.push(fmt(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  } else if (granularity === 'week') {
    // Week buckets start on Monday (ClickHouse toStartOfWeek mode=1)
    const cursor = new Date(start);
    // Snap to Monday of the week containing start
    const dow = cursor.getUTCDay(); // 0=Sun, 1=Mon, ...
    const diffToMonday = dow === 0 ? 6 : dow - 1;
    cursor.setUTCDate(cursor.getUTCDate() - diffToMonday);
    while (cursor <= end) {
      buckets.push(fmt(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  } else if (granularity === 'month') {
    // Month buckets: first day of each month
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    while (cursor <= end) {
      buckets.push(fmt(cursor));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }

  return buckets;
}

/**
 * Build cumulative (running total) data points from series.
 * Wraps `buildDataPoints()` and applies a running sum per series key.
 * Each bucket's value becomes the sum of all previous buckets' values plus its own.
 * Previous-period series (prev_*) are also accumulated independently.
 */
export function buildCumulativeDataPoints(
  series: TrendSeriesResult[],
  previousSeries?: TrendSeriesResult[],
  dateRange?: DateRangeParams,
): Record<string, string | number>[] {
  const points = buildDataPoints(series, previousSeries, dateRange);
  if (points.length === 0) {return points;}

  // Collect all numeric keys (everything except 'bucket')
  const numericKeys = new Set<string>();
  for (const point of points) {
    for (const key of Object.keys(point)) {
      if (key !== 'bucket') {numericKeys.add(key);}
    }
  }

  // Running totals per key
  const accumulators = new Map<string, number>();
  for (const key of numericKeys) {
    accumulators.set(key, 0);
  }

  return points.map((point) => {
    const cumPoint: Record<string, string | number> = { bucket: point.bucket };
    for (const key of numericKeys) {
      const current = (point[key] as number) ?? 0;
      const acc = (accumulators.get(key) ?? 0) + current;
      accumulators.set(key, acc);
      cumPoint[key] = acc;
    }
    return cumPoint;
  });
}

/**
 * Build chart data points from series, optionally merging previous-period data.
 * When `dateRange` is provided, generates the full set of buckets for the range
 * so that the X axis always shows every date/hour/week/month in the range,
 * filling missing data points with 0.
 */
export function buildDataPoints(
  series: TrendSeriesResult[],
  previousSeries?: TrendSeriesResult[],
  dateRange?: DateRangeParams,
): Record<string, string | number>[] {
  const bucketSet = new Set<string>();
  for (const s of series) {
    for (const dp of s.data) {bucketSet.add(dp.bucket);}
  }

  // When dateRange is provided, generate the full bucket set and merge
  if (dateRange) {
    // Detect bucket format from existing data (if any)
    const existingSample = bucketSet.size > 0 ? bucketSet.values().next().value as string : undefined;
    const generated = generateBuckets(dateRange.dateFrom, dateRange.dateTo, dateRange.granularity, existingSample);
    for (const b of generated) {bucketSet.add(b);}
  }

  const buckets = Array.from(bucketSet).sort();

  return buckets.map((bucket, index) => {
    const point: Record<string, string | number> = { bucket };
    for (const s of series) {
      const key = seriesKey(s);
      const dp = s.data.find((d) => d.bucket === bucket);
      point[key] = dp?.value ?? 0;
    }
    if (previousSeries) {
      for (const ps of previousSeries) {
        const key = `prev_${seriesKey(ps)}`;
        // Previous-period buckets have different date values than current-period
        // buckets (e.g. "2026-02-13" vs "2026-02-20"), so matching by bucket
        // string never works. Use positional index instead: the i-th bucket of
        // the current period corresponds to the i-th data point of the previous
        // period.
        const dp = ps.data[index];
        point[key] = dp?.value ?? 0;
      }
    }
    return point;
  });
}
