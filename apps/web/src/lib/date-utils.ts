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

/** Default date range: 30 days ago → today. */
export function defaultDateRange(): { from: string; to: string } {
  return { from: daysAgoIso(30), to: todayIso() };
}

/** Standard date range presets. */
export const DATE_PRESETS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '6m', days: 180 },
  { label: '1y', days: 365 },
] as const;

/**
 * Returns the `days` value of the matching preset if the given date range
 * aligns exactly with one of the standard presets, otherwise `undefined`.
 */
export function getActivePreset(dateFrom: string, dateTo: string): number | undefined {
  for (const preset of DATE_PRESETS) {
    if (dateFrom.slice(0, 10) === daysAgoIso(preset.days) && dateTo.slice(0, 10) === todayIso()) {
      return preset.days;
    }
  }
  return undefined;
}
