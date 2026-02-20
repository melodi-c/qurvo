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
