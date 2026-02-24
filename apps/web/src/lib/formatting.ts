/** Shared formatting utilities for charts and data display. */

/** Format a time bucket string for chart axes. */
export function formatBucket(bucket: string, granularity: string): string {
  const d = new Date(bucket);
  if (granularity === 'hour') {
    return d.toLocaleString('en', { month: 'short', day: 'numeric', hour: 'numeric' });
  }
  if (granularity === 'week') {
    return `W${getISOWeek(d)} ${d.toLocaleString('en', { month: 'short' })}`;
  }
  if (granularity === 'month') {
    return d.toLocaleString('en', { month: 'short', year: '2-digit' });
  }
  // day (default)
  return d.toLocaleString('en', { month: 'short', day: 'numeric' });
}

/** Format seconds into a human-readable duration. */
export function formatSeconds(s: number | null | undefined): string | null {
  if (s == null) return null;
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

/** Get ISO week number. */
function getISOWeek(d: Date): number {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}
