import type { TrendWidgetConfig } from '@/api/generated/Api';
import { defaultDateRange } from '@/lib/date-utils';

export const SERIES_LETTERS: readonly string[] = ['A', 'B', 'C', 'D', 'E'];

export function defaultTrendConfig(seriesLabel = 'Series 1'): TrendWidgetConfig {
  const { from, to } = defaultDateRange();
  return {
    type: 'trend',
    series: [{ event_name: '', label: seriesLabel }],
    metric: 'total_events',
    granularity: 'day',
    chart_type: 'line',
    date_from: from,
    date_to: to,
    compare: false,
  };
}