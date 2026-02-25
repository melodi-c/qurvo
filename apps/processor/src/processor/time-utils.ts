const ONE_HOUR_MS = 3_600_000;

/** Floor a millisecond timestamp to the start of its hour. */
export function floorToHourMs(ms: number): number {
  return Math.floor(ms / ONE_HOUR_MS) * ONE_HOUR_MS;
}
