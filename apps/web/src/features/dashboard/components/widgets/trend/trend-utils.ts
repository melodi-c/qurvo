import type { TrendSeriesResult } from '@/api/generated/Api';

/** Build a display key for a series, including breakdown value when present. */
export function seriesKey(s: TrendSeriesResult): string {
  if (s.breakdown_value) {return `${s.label} (${s.breakdown_value})`;}
  return s.label;
}

/** Detect if a bucket falls in the current (incomplete) period. */
export function isIncompleteBucket(bucket: string, granularity?: string): boolean {
  if (!granularity) {return false;}
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  if (granularity === 'hour') {
    // Bucket format: "2026-02-27 14:00:00" (space separator, not ISO T).
    // toISOString() produces "2026-02-27T14:..." — replace T with space to match.
    const currentHour = now.toISOString().slice(0, 13).replace('T', ' ');
    return bucket.startsWith(currentHour);
  }
  if (granularity === 'day') {return bucket === today;}
  if (granularity === 'week') {
    const bucketDate = new Date(bucket.slice(0, 10));
    const diffDays = (now.getTime() - bucketDate.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays < 7;
  }
  if (granularity === 'month') {
    return bucket.slice(0, 7) === today.slice(0, 7);
  }
  return false;
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
