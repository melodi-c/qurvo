import type { TrendSeriesResult } from '@/api/generated/Api';

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
    return d.toISOString().slice(0, 10);
  }
  if (granularity === 'month') {
    // Month buckets are "YYYY-MM-01".
    return date.slice(0, 7) + '-01';
  }
  // day: bucket is "YYYY-MM-DD" — same as annotation date
  return date;
}

/** Build chart data points from series, optionally merging previous-period data. */
export function buildDataPoints(
  series: TrendSeriesResult[],
  previousSeries?: TrendSeriesResult[],
): Record<string, string | number>[] {
  const bucketSet = new Set<string>();
  for (const s of series) {
    for (const dp of s.data) {bucketSet.add(dp.bucket);}
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
