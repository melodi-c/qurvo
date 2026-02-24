/** Shared formatting utilities for charts and data display. */

import { useLanguageStore } from '@/stores/language';

function getLocale(): string {
  return useLanguageStore.getState().language;
}

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
  return new Date(iso).toLocaleDateString(getLocale());
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

/** Format a time bucket string for chart axes. When compact=true, produces shorter labels for small spaces. */
export function formatBucket(bucket: string, granularity: string, compact?: boolean): string {
  if (!bucket) return '';
  const locale = getLocale();
  const d = new Date(bucket);
  if (granularity === 'hour') {
    if (compact) return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}h`;
    return d.toLocaleString(locale, { month: 'short', day: 'numeric', hour: 'numeric' });
  }
  if (granularity === 'week') {
    return `W${getISOWeek(d)} ${d.toLocaleString(locale, { month: 'short' })}`;
  }
  if (granularity === 'month') {
    return d.toLocaleString(locale, { month: 'short', year: '2-digit' });
  }
  // day (default)
  if (compact) return d.toLocaleString(locale, { month: 'numeric', day: 'numeric' });
  return d.toLocaleString(locale, { month: 'short', day: 'numeric' });
}

/** Format seconds into a human-readable duration. */
export function formatSeconds(s: number | null | undefined): string | null {
  if (s == null) return null;
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

/** Pluralize a granularity label (day/week/month) for a given count. */
export function formatGranularity(count: number, granularity: string): string {
  const locale = getLocale();
  const forms: Record<string, { en: [string, string]; ru: [string, string, string] }> = {
    day:   { en: ['day', 'days'],       ru: ['день', 'дня', 'дней'] },
    week:  { en: ['week', 'weeks'],     ru: ['неделя', 'недели', 'недель'] },
    month: { en: ['month', 'months'],   ru: ['месяц', 'месяца', 'месяцев'] },
  };
  const f = forms[granularity];
  if (!f) return granularity;

  if (locale === 'ru') {
    const abs = Math.abs(count);
    const mod10 = abs % 10;
    const mod100 = abs % 100;
    if (mod10 === 1 && mod100 !== 11) return f.ru[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return f.ru[1];
    return f.ru[2];
  }
  return Math.abs(count) === 1 ? f.en[0] : f.en[1];
}

/** Get ISO week number. */
function getISOWeek(d: Date): number {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}
