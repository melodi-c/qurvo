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

/** Format an ISO date/timestamp string as date + time using the current locale. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(getLocale());
}

/** Format an ISO date string with granularity context (month: "Jan 2024", other: "Jan 15").
 * Uses the provided timezone (or UTC) to avoid browser-local offset shifts. */
export function formatDateWithGranularity(iso: string, granularity: string, timezone?: string): string {
  const locale = getLocale();
  const displayTz = timezone || 'UTC';
  // Normalise ClickHouse bucket format to UTC ISO 8601
  const utcStr = normaliseBucketToUtc(iso);
  const d = new Date(utcStr);
  if (granularity === 'month') {
    return d.toLocaleDateString(locale, { month: 'short', year: 'numeric', timeZone: displayTz });
  }
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', timeZone: displayTz });
}

/** Format a short date range from two ISO strings. Extracts MM-DD portion (e.g. "03-15 – 04-20"). Returns null if either value is not a string. */
export function formatShortDateRange(from: unknown, to: unknown): string | null {
  if (typeof from !== 'string' || typeof to !== 'string') {return null;}
  const fShort = from.slice(5); // MM-DD
  const tShort = to.slice(5);
  return `${fShort} – ${tShort}`;
}

/** Format an ISO timestamp into a relative time string (e.g. "5 minutes ago"). Uses Intl.RelativeTimeFormat for locale-aware output. */
export function formatRelativeTime(iso: string): string {
  const locale = getLocale();
  const diff = Date.now() - new Date(iso).getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (diff < 0) {return rtf.format(0, 'second');}
  const s = Math.floor(diff / 1000);
  if (s < 60) {return rtf.format(-s, 'second');}
  const m = Math.floor(s / 60);
  if (m < 60) {return rtf.format(-m, 'minute');}
  const h = Math.floor(m / 60);
  if (h < 24) {return rtf.format(-h, 'hour');}
  return new Date(iso).toLocaleDateString(locale);
}

/** Normalise a ClickHouse bucket string to a UTC ISO 8601 string parseable by `new Date()`.
 * ClickHouse returns "YYYY-MM-DD HH:MM:SS" (space, no tz) or "YYYY-MM-DD" (date-only).
 * Already-normalised strings (containing 'T' or 'Z') are returned as-is. */
function normaliseBucketToUtc(bucket: string): string {
  if (bucket.includes('T') || bucket.includes('Z')) {return bucket;} // already ISO
  if (bucket.includes(' ')) {return bucket.replace(' ', 'T') + 'Z';} // "YYYY-MM-DD HH:MM:SS"
  return bucket + 'T00:00:00Z';                                     // "YYYY-MM-DD"
}

/** Return a badge variant for a given event name. */
export function eventBadgeVariant(eventName: string): 'default' | 'secondary' | 'outline' {
  if (eventName === '$pageview') {return 'default';}
  if (eventName === '$pageleave') {return 'default';}
  if (eventName === '$identify') {return 'secondary';}
  if (eventName === '$set' || eventName === '$set_once') {return 'secondary';}
  if (eventName === '$screen') {return 'default';}
  return 'outline';
}

/** Format a time bucket string for chart axes. When compact=true, produces shorter labels for small spaces.
 * Bucket strings from ClickHouse are always UTC — normalise to ISO 8601 with 'Z' suffix before parsing.
 * When timezone is provided, display dates in that timezone rather than browser-local time. */
export function formatBucket(bucket: string, granularity: string, compact?: boolean, timezone?: string): string {
  if (!bucket) {return '';}
  const locale = getLocale();
  const d = new Date(normaliseBucketToUtc(bucket));
  // For display: use the project's timezone when provided, else UTC (avoids browser-local offset shifts).
  const displayTz = timezone || 'UTC';
  if (granularity === 'hour') {
    if (compact) {
      const parts = new Intl.DateTimeFormat(locale, {
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        timeZone: displayTz,
      }).formatToParts(d);
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
      return `${get('month')}/${get('day')} ${get('hour')}h`;
    }
    return d.toLocaleString(locale, { month: 'short', day: 'numeric', hour: 'numeric', timeZone: displayTz });
  }
  if (granularity === 'week') {
    // Compute the ISO week number from the date adjusted to displayTz
    const localDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: displayTz }).format(d);
    const weekDate = new Date(localDateStr + 'T00:00:00Z');
    return `W${getISOWeek(weekDate)} ${d.toLocaleString(locale, { month: 'short', timeZone: displayTz })}`;
  }
  if (granularity === 'month') {
    return d.toLocaleString(locale, { month: 'short', year: '2-digit', timeZone: displayTz });
  }
  // day (default)
  if (compact) {return d.toLocaleString(locale, { month: 'numeric', day: 'numeric', timeZone: displayTz });}
  return d.toLocaleString(locale, { month: 'short', day: 'numeric', timeZone: displayTz });
}

/** Format seconds into a human-readable duration. Locale-aware suffixes (e.g. "30с", "5м", "2ч", "3д" in Russian). Supports days. */
export function formatSeconds(s: number | null | undefined): string | null {
  if (s === null || s === undefined) {return null;}
  const lang = getLocale() as 'en' | 'ru';
  const ru = lang === 'ru';
  if (s < 60) {return `${Math.round(s)}${ru ? 'с' : 's'}`;}
  if (s < 3600) {return `${Math.round(s / 60)}${ru ? 'м' : 'm'}`;}
  if (s < 86400) {return `${(s / 3600).toFixed(1).replace(/\.0$/, '')}${ru ? 'ч' : 'h'}`;}
  return `${(s / 86400).toFixed(1).replace(/\.0$/, '')}${ru ? 'д' : 'd'}`;
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
  if (!f) {return granularity;}
  return pluralize(count, f, lang);
}

/** Format a number compactly for chart axes (e.g. 1234 → "1.2K", 4500000 → "4.5M"). */
export function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) {return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;}
  if (n >= 1_000) {return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;}
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
