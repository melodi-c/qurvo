import { format, parse } from 'date-fns';

/**
 * Return today's date parts in the given IANA timezone (or browser-local when
 * omitted).  Uses `Intl.DateTimeFormat` — the same approach as
 * `nowInTimezone()` in `trend-utils.ts`.
 */
function todayInTimezone(timezone?: string): { year: number; month: number; day: number } {
  const now = new Date();
  if (!timezone) {
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { year: Number(get('year')), month: Number(get('month')), day: Number(get('day')) };
}

/**
 * Returns today's date as ISO string (YYYY-MM-DD).
 * When `timezone` is provided, "today" is determined in that IANA timezone
 * instead of the browser's local clock.
 */
export function todayIso(timezone?: string): string {
  const { year, month, day } = todayInTimezone(timezone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Returns the date `days` days ago as ISO string (YYYY-MM-DD).
 * When `timezone` is provided, "today" is determined in that timezone first.
 */
export function daysAgoIso(days: number, timezone?: string): string {
  const { year, month, day } = todayInTimezone(timezone);
  // Build a UTC date from the timezone-local "today" and subtract days
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Default date range: relative -30d -> today (relative). */
export function defaultDateRange(): { from: string; to: string } {
  return { from: '-30d', to: '-0d' };
}

/**
 * Regex for relative date strings: -Nd, -Ny.
 * Matches: '-7d', '-30d', '-90d', '-180d', '-1y'
 */
const RELATIVE_DATE_REGEX = /^-(\d+)([dy])$/;
const RELATIVE_ANCHORS = new Set(['mStart', 'yStart']);

/**
 * Returns true when the value is a relative date token
 * (e.g. `-7d`, `-1y`, `mStart`, `yStart`).
 */
export function isRelativeDate(value: string): boolean {
  return RELATIVE_DATE_REGEX.test(value) || RELATIVE_ANCHORS.has(value);
}

/**
 * Resolves a relative date string to an absolute `YYYY-MM-DD` value.
 *
 * When `timezone` is provided, "today" is determined in that IANA timezone
 * (using `Intl.DateTimeFormat`) instead of the browser's local clock.
 * This matches the API-side behaviour in `analytics-query.factory.ts`.
 *
 * Supported formats:
 *  - `-Nd`     -> N days ago
 *  - `-Ny`     -> N*365 days ago
 *  - `mStart`  -> first day of the current month
 *  - `yStart`  -> first day of the current year
 *  - `YYYY-MM-DD` -> returned as-is (passthrough)
 */
export function resolveRelativeDate(value: string, timezone?: string): string {
  // Absolute date passthrough
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const { year, month, day } = todayInTimezone(timezone);
  // Work in UTC to avoid any further local-timezone shifts
  const today = new Date(Date.UTC(year, month - 1, day));

  // Anchors
  if (value === 'mStart') {
    today.setUTCDate(1);
    return formatUtcDate(today);
  }
  if (value === 'yStart') {
    today.setUTCMonth(0, 1);
    return formatUtcDate(today);
  }

  // Relative offset: -Nd or -Ny
  const match = RELATIVE_DATE_REGEX.exec(value);
  if (!match) {
    return value; // unknown format — return as-is for safety
  }

  const amount = Number(match[1]);
  const unit = match[2];

  if (unit === 'd') {
    today.setUTCDate(today.getUTCDate() - amount);
  } else if (unit === 'y') {
    today.setUTCDate(today.getUTCDate() - amount * 365);
  }

  return formatUtcDate(today);
}

function formatUtcDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface DatePreset {
  label: string;
  /** Relative string stored in widget config */
  relative: string;
  /** Number of days for this preset (used for active-preset detection with absolute dates) */
  days: number;
}

/** Standard date range presets. */
export const DATE_PRESETS: readonly DatePreset[] = [
  { label: '7d', relative: '-7d', days: 7 },
  { label: '30d', relative: '-30d', days: 30 },
  { label: '90d', relative: '-90d', days: 90 },
  { label: '6m', relative: '-180d', days: 180 },
  { label: '1y', relative: '-1y', days: 365 },
] as const;

/** Named anchor presets (MTD, YTD). */
export interface AnchorPreset {
  labelKey: string;
  relative: string;
}

export const ANCHOR_PRESETS: readonly AnchorPreset[] = [
  { labelKey: 'mtd', relative: 'mStart' },
  { labelKey: 'ytd', relative: 'yStart' },
] as const;

export type PresetLabelKey =
  | 'last7days'
  | 'last30days'
  | 'last90days'
  | 'last6months'
  | 'last1year'
  | 'monthToDate'
  | 'yearToDate';

const PRESET_LABEL_MAP: Record<string, PresetLabelKey> = {
  '-7d': 'last7days',
  '-30d': 'last30days',
  '-90d': 'last90days',
  '-180d': 'last6months',
  '-1y': 'last1year',
  'mStart': 'monthToDate',
  'yStart': 'yearToDate',
};

/**
 * Maps a relative date token to a translation key for human-readable display.
 * Returns `undefined` for absolute dates or unknown tokens.
 */
export function getPresetLabelKey(dateFrom: string): PresetLabelKey | undefined {
  return PRESET_LABEL_MAP[dateFrom];
}

/**
 * Returns the matching preset `relative` string if the given date range
 * matches one of the standard presets, otherwise `undefined`.
 *
 * When `timezone` is provided, "today" and "N days ago" are evaluated in that
 * IANA timezone (important for legacy absolute-date preset matching).
 *
 * Supports both:
 * - Relative strings in dateFrom (e.g. `-30d`, `mStart`)
 * - Legacy absolute dates that align with a preset
 */
export function getActivePreset(dateFrom: string, dateTo: string, timezone?: string): string | undefined {
  // dateTo must represent "today": either the relative token `-0d` or
  // a legacy absolute date that equals today's ISO string.
  const dateToIsToday = dateTo === '-0d' || dateTo.slice(0, 10) === todayIso(timezone);

  // Check relative string match (new format)
  if (isRelativeDate(dateFrom)) {
    if (!dateToIsToday) {
      return undefined;
    }
    // Check day-based presets
    for (const preset of DATE_PRESETS) {
      if (dateFrom === preset.relative) {
        return preset.relative;
      }
    }
    // Check anchor presets
    for (const preset of ANCHOR_PRESETS) {
      if (dateFrom === preset.relative) {
        return preset.relative;
      }
    }
    return undefined;
  }

  // Legacy: check absolute dates against presets
  if (!dateToIsToday) {
    return undefined;
  }
  for (const preset of DATE_PRESETS) {
    if (dateFrom.slice(0, 10) === daysAgoIso(preset.days, timezone)) {
      return preset.relative;
    }
  }
  return undefined;
}

/**
 * Formats an ISO date string (YYYY-MM-DD) into a human-readable form (e.g. "Mar 2, 2026").
 * Returns the original string if parsing fails.
 */
export function formatAbsoluteDate(iso: string): string {
  try {
    return format(parse(iso, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy');
  } catch {
    return iso;
  }
}
