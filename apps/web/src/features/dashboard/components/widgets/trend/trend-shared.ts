import type { TrendWidgetConfig } from '@/api/generated/Api';

export const SERIES_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;

export function defaultTrendConfig(): TrendWidgetConfig {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return {
    type: 'trend',
    series: [{ event_name: '', label: 'Series 1' }],
    metric: 'total_events',
    granularity: 'day',
    chart_type: 'line',
    date_from: from,
    date_to: to,
    compare: false,
  };
}

export const METRIC_OPTIONS = [
  { value: 'total_events', label: 'Total events' },
  { value: 'unique_users', label: 'Unique users' },
  { value: 'events_per_user', label: 'Events per user' },
] as const;

export const GRANULARITY_OPTIONS = [
  { value: 'hour', label: 'Hour' },
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
] as const;

export const CHART_TYPE_OPTIONS = [
  { value: 'line', label: 'Line' },
  { value: 'bar', label: 'Bar' },
] as const;
