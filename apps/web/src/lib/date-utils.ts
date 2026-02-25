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
