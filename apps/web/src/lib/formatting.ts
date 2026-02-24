/** Shared formatting utilities for charts and data display. */

/** Format an ISO timestamp into a relative time string (e.g. "5m ago"). */
export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

/** Return a badge variant for a given event name. */
export function eventBadgeVariant(eventName: string): 'default' | 'secondary' | 'outline' {
  if (eventName === '$pageview') return 'default';
  if (eventName === '$pageleave') return 'default';
  if (eventName === '$identify') return 'secondary';
  if (eventName === '$set' || eventName === '$set_once') return 'secondary';
  if (eventName === '$screen') return 'default';
  return 'outline';
}

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
