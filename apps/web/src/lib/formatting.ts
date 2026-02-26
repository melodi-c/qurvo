/** Shared formatting utilities for charts and data display. */

import { useLanguageStore } from '@/stores/language';
import { pluralize } from '@/i18n/pluralize';

function getLocale(): string {
  return useLanguageStore.getState().language;
}

/** Format an ISO date/timestamp string using the current locale. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(getLocale());
}

/** Format an ISO timestamp into a relative time string (e.g. "5 minutes ago"). Uses Intl.RelativeTimeFormat for locale-aware output. */
export function formatRelativeTime(iso: string): string {
  const locale = getLocale();
  const diff = Date.now() - new Date(iso).getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (diff < 0) return rtf.format(0, 'second');
  const s = Math.floor(diff / 1000);
  if (s < 60) return rtf.format(-s, 'second');
  const m = Math.floor(s / 60);
  if (m < 60) return rtf.format(-m, 'minute');
  const h = Math.floor(m / 60);
  if (h < 24) return rtf.format(-h, 'hour');
  return new Date(iso).toLocaleDateString(locale);
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
  const lang = getLocale() as 'en' | 'ru';
  const forms: Record<string, { one: string; few: string; many: string }> = {
    day:   { one: lang === 'ru' ? 'день' : 'day',     few: lang === 'ru' ? 'дня' : 'days',     many: lang === 'ru' ? 'дней' : 'days' },
    week:  { one: lang === 'ru' ? 'неделя' : 'week',  few: lang === 'ru' ? 'недели' : 'weeks',  many: lang === 'ru' ? 'недель' : 'weeks' },
    month: { one: lang === 'ru' ? 'месяц' : 'month',  few: lang === 'ru' ? 'месяца' : 'months', many: lang === 'ru' ? 'месяцев' : 'months' },
  };
  const f = forms[granularity];
  if (!f) return granularity;
  return pluralize(count, f, lang);
}

/** Format a number compactly for chart axes (e.g. 1234 → "1.2K", 4500000 → "4.5M"). */
export function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

/** Get ISO week number. */
function getISOWeek(d: Date): number {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}
