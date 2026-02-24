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

/** Shared grid stroke color — use instead of hardcoded '#27272a'. */
export const CHART_GRID_COLOR = 'var(--color-border)';
