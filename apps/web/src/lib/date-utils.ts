/** Returns today's date as ISO string (YYYY-MM-DD). */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns the date `days` days ago as ISO string (YYYY-MM-DD). */
export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Default date range: relative -30d -> today. */
export function defaultDateRange(): { from: string; to: string } {
  return { from: '-30d', to: todayIso() };
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
 * Supported formats:
 *  - `-Nd`     -> N days ago
 *  - `-Ny`     -> N*365 days ago
 *  - `mStart`  -> first day of the current month
 *  - `yStart`  -> first day of the current year
 *  - `YYYY-MM-DD` -> returned as-is (passthrough)
 */
export function resolveRelativeDate(value: string): string {
  // Absolute date passthrough
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Anchors
  if (value === 'mStart') {
    today.setDate(1);
    return formatLocalDate(today);
  }
  if (value === 'yStart') {
    today.setMonth(0, 1);
    return formatLocalDate(today);
  }

  // Relative offset: -Nd or -Ny
  const match = RELATIVE_DATE_REGEX.exec(value);
  if (!match) {
    return value; // unknown format — return as-is for safety
  }

  const amount = Number(match[1]);
  const unit = match[2];

  if (unit === 'd') {
    today.setDate(today.getDate() - amount);
  } else if (unit === 'y') {
    today.setDate(today.getDate() - amount * 365);
  }

  return formatLocalDate(today);
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
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

/**
 * Returns the matching preset `relative` string if the given date range
 * matches one of the standard presets, otherwise `undefined`.
 *
 * Supports both:
 * - Relative strings in dateFrom (e.g. `-30d`, `mStart`)
 * - Legacy absolute dates that align with a preset
 */
export function getActivePreset(dateFrom: string, dateTo: string): string | undefined {
  // Check relative string match (new format)
  if (isRelativeDate(dateFrom)) {
    // Presets always set dateTo to todayIso() — only match if dateTo is today
    if (dateTo.slice(0, 10) !== todayIso()) {
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
  const todayStr = todayIso();
  if (dateTo.slice(0, 10) !== todayStr) {
    return undefined;
  }
  for (const preset of DATE_PRESETS) {
    if (dateFrom.slice(0, 10) === daysAgoIso(preset.days)) {
      return preset.relative;
    }
  }
  return undefined;
}
