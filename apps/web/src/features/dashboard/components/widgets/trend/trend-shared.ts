import type { ChartType, TrendWidgetConfig } from '@/api/generated/Api';

export const SERIES_LETTERS: readonly string[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

/** Time-series chart types that use granularity on the x-axis */
export const TIME_SERIES_CHART_TYPES: readonly ChartType[] = ['line', 'bar', 'area', 'cumulative', 'table'] as const;

/** Aggregate chart types that show a single aggregated value per series */
export const AGGREGATE_CHART_TYPES: readonly ChartType[] = ['number', 'value_bar', 'pie'] as const;

/** Special chart types that require custom query parameters */
export const CUSTOM_QUERY_CHART_TYPES: readonly ChartType[] = ['world_map', 'calendar_heatmap'] as const;

/** All 10 chart types in display order */
export const ALL_CHART_TYPES: readonly ChartType[] = [
  ...TIME_SERIES_CHART_TYPES,
  ...AGGREGATE_CHART_TYPES,
  ...CUSTOM_QUERY_CHART_TYPES,
] as const;

/** Chart types that support granularity selection */
export function supportsGranularity(chartType: ChartType): boolean {
  return TIME_SERIES_CHART_TYPES.includes(chartType);
}

/** Chart types that support compare toggle */
export function supportsCompare(chartType: ChartType): boolean {
  return !CUSTOM_QUERY_CHART_TYPES.includes(chartType);
}

/** Chart types that support formula builder */
export function supportsFormulas(chartType: ChartType): boolean {
  return TIME_SERIES_CHART_TYPES.includes(chartType);
}

/** Chart types that support annotations */
export function supportsAnnotations(chartType: ChartType): boolean {
  return TIME_SERIES_CHART_TYPES.includes(chartType);
}

/** Chart types that support breakdown */
export function supportsBreakdown(chartType: ChartType): boolean {
  return !CUSTOM_QUERY_CHART_TYPES.includes(chartType);
}

export function defaultTrendConfig(seriesLabel = 'Series 1'): TrendWidgetConfig {
  return {
    type: 'trend',
    series: [{ event_name: '', label: seriesLabel, metric: 'total_events' }],
    granularity: 'day',
    chart_type: 'line',
    date_from: '-30d',
    date_to: '-0d',
    compare: false,
  };
}
