/**
 * Computes the percentage change of `current` relative to `baselineAvg`.
 * Returns 0 when `baselineAvg` is 0 to avoid division by zero.
 */
export function computeChangePercent(current: number, baselineAvg: number): number {
  return baselineAvg > 0
    ? Math.round(((current - baselineAvg) / baselineAvg) * 100)
    : 0;
}
