import { CHART_COLORS_HEX } from '@/lib/chart-colors';

export const BAR_AREA_H_FULL = 240;
export const BAR_AREA_H_COMPACT = 130;

/** Hex colors for breakdown series (no opacity needed — applied per-element). */
export const SERIES_COLORS = CHART_COLORS_HEX;

/** PostHog bar-width ladder based on number of series. */
export function barWidthPx(n: number, compact: boolean): number {
  const scale = compact ? 0.6 : 1;
  let base: number;
  if (n >= 20) {base = 8;}
  else if (n >= 12) {base = 16;}
  else if (n >= 8) {base = 24;}
  else if (n >= 6) {base = 32;}
  else if (n >= 5) {base = 40;}
  else if (n >= 4) {base = 48;}
  else if (n >= 3) {base = 64;}
  else if (n >= 2) {base = 96;}
  else {base = 96;}
  return Math.round(base * scale);
}
