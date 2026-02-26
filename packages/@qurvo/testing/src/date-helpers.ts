export const DAY_MS = 86_400_000;

/** Returns YYYY-MM-DD for N days ago (UTC) */
export function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Returns YYYY-MM-DD for a date offset by the given number of days from now */
export function dateOffset(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Returns ISO timestamp for a specific UTC hour N days ago */
export function ts(daysBack: number, hour = 12): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysBack);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

/** Returns ISO timestamp offset by the given milliseconds from now */
export function msAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

/**
 * Returns an ISO timestamp for the Monday (noon UTC) of the ISO week
 * that contains the date N days ago.
 * Useful for placing test events at the start of their weekly bucket so they
 * are always captured by retention/stickiness query truncated date windows.
 */
export function mondayOfWeekContaining(daysBack: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysBack);
  d.setUTCHours(12, 0, 0, 0);
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1; // ISO Monday = 1, Sunday = 0
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString();
}

/**
 * Returns an ISO timestamp for the 1st of the month (noon UTC) that contains
 * the date N days ago.
 * Useful for placing test events at the start of their monthly bucket so they
 * are always captured by retention query truncated date windows.
 */
export function firstOfMonthContaining(daysBack: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysBack);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12, 0, 0, 0)).toISOString();
}
