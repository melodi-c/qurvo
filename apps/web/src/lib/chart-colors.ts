/** Centralized chart color palette — single source of truth for all visualizations. */

/** Primary series colors (hex). Used in FunnelChart, PathsChart, and anywhere hex is needed. */
export const CHART_COLORS_HEX = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#ef4444', '#ec4899', '#06b6d4', '#84cc16',
  '#6366f1', '#14b8a6',
] as const;

/** Primary series colors (HSL). Used in TrendChart where HSL with alpha is useful. */
export const CHART_COLORS_HSL = [
  'hsl(221, 83%, 53%)',   // blue-600
  'hsl(160, 84%, 39%)',   // emerald-600
  'hsl(38, 92%, 50%)',    // amber-500
  'hsl(263, 70%, 50%)',   // violet-500
  'hsl(350, 89%, 60%)',   // rose-500
] as const;

/** Muted compare/previous-period colors (HSL). */
export const CHART_COMPARE_COLORS_HSL = [
  'hsl(221, 60%, 75%)',
  'hsl(160, 60%, 70%)',
  'hsl(38, 60%, 75%)',
  'hsl(263, 50%, 75%)',
  'hsl(350, 60%, 78%)',
] as const;

/** Formula overlay colors (HSL). */
export const CHART_FORMULA_COLORS_HSL = [
  'hsl(45, 93%, 58%)',    // yellow-400
  'hsl(180, 70%, 50%)',   // cyan-500
  'hsl(330, 80%, 60%)',   // pink-500
  'hsl(90, 60%, 50%)',    // lime-500
  'hsl(270, 60%, 65%)',   // purple-400
] as const;

/** Tailwind class names for series builder color dots. */
export const CHART_COLORS_TW = [
  'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-violet-500', 'bg-rose-500',
] as const;

/** Web analytics metric-specific colors. */
export const WEB_METRIC_COLORS = {
  unique_visitors: '#818cf8',
  pageviews: '#34d399',
  sessions: '#fbbf24',
} as const;

/** Shared Recharts tooltip contentStyle — use instead of hardcoded hex values. */
export const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'var(--color-popover)',
  border: '1px solid var(--color-border)',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'var(--color-popover-foreground)',
} as const;

/** Shared axis tick fill color — use instead of hardcoded '#a1a1aa'. */
export const CHART_AXIS_TICK_COLOR = 'var(--color-muted-foreground)';

/** Shared axis tick style. Use for Recharts `tick` prop on XAxis/YAxis. */
export function chartAxisTick(compact?: boolean) {
  return { fontSize: compact ? 10 : 12, fill: CHART_AXIS_TICK_COLOR };
}

/** Shared grid stroke color — use instead of hardcoded '#27272a'. */
export const CHART_GRID_COLOR = 'var(--color-border)';

/** Semantic status colors for UI indicators (deltas, conversion, drop-off, success, warnings). */
export const STATUS_COLORS = {
  positive: 'text-emerald-400',
  negative: 'text-red-400',
  warning: 'text-amber-400',
  success: 'text-green-500',
  successBorder: 'border-green-800',
  successText: 'text-green-400',
} as const;

/** Hex equivalents of STATUS_COLORS for SVG/Recharts fill props (emerald-500 / red-500). */
export const STATUS_COLORS_HEX = {
  positive: '#10b981',
  negative: '#ef4444',
} as const;

/** Event type icon colors — keyed by event name prefix. */
export const EVENT_TYPE_COLORS = {
  pageview: 'text-blue-400',
  pageleave: 'text-orange-400',
  identify: 'text-violet-400',
  set: 'text-green-400',
  screen: 'text-sky-400',
  custom: 'text-amber-400',
} as const;

/** Funnel step legend colors. */
export const FUNNEL_LEGEND_COLORS = {
  conversion: 'text-emerald-500',
  dropOff: 'text-red-400',
} as const;

/** Preset colors for annotation color picker. */
export const ANNOTATION_PRESET_COLORS = [
  '#ef4444', // red-500
  '#f97316', // orange-500
  '#eab308', // yellow-500
  '#22c55e', // green-500
  '#3b82f6', // blue-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#a1a1aa', // zinc-400
] as const;

/** World map choropleth colors. */
/** Country fill when no data is present, and gradient start (t=0) — zinc-800 (#27272a). */
export const MAP_COLOR_EMPTY = '#27272a';
export const MAP_COLOR_FROM = MAP_COLOR_EMPTY;
/** Gradient end color (t=1) — indigo-400 (#818cf8). */
export const MAP_COLOR_TO = '#818cf8';
/** Stroke color for country borders — zinc-950 (#09090b). */
export const MAP_STROKE_COLOR = '#09090b';
/** Hover fill color for countries with data — indigo-300 (#a5b4fc). */
export const MAP_HOVER_WITH_DATA_COLOR = '#a5b4fc';
/** Hover fill color for countries without data — zinc-700 (#3f3f46). */
export const MAP_HOVER_NO_DATA_COLOR = '#3f3f46';

/**
 * Interpolates between MAP_COLOR_FROM and MAP_COLOR_TO by factor `t` (0–1).
 * Used for choropleth fill colors in GeographySection.
 */
export function interpolateMapColor(t: number): string {
  const r0 = 0x27, g0 = 0x27, b0 = 0x2a;
  const r1 = 0x81, g1 = 0x8c, b1 = 0xf8;
  const r = Math.round(r0 + (r1 - r0) * t);
  const g = Math.round(g0 + (g1 - g0) * t);
  const b = Math.round(b0 + (b1 - b0) * t);
  return `rgb(${r},${g},${b})`;
}
