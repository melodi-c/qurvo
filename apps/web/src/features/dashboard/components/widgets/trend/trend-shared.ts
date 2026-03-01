import type { TrendWidgetConfig } from '@/api/generated/Api';
import { todayIso } from '@/lib/date-utils';

export const SERIES_LETTERS: readonly string[] = ['A', 'B', 'C', 'D', 'E'];

export function defaultTrendConfig(seriesLabel = 'Series 1'): TrendWidgetConfig {
  return {
    type: 'trend',
    series: [{ event_name: '', label: seriesLabel }],
    metric: 'total_events',
    granularity: 'day',
    chart_type: 'line',
    date_from: '-30d',
    date_to: todayIso(),
    compare: false,
  };
}
