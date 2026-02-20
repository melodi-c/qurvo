import type { RetentionWidgetConfig } from '@/api/generated/Api';

export function defaultRetentionConfig(): RetentionWidgetConfig {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return {
    type: 'retention',
    target_event: '',
    retention_type: 'first_time',
    granularity: 'day',
    periods: 11,
    date_from: from,
    date_to: to,
  };
}

export const RETENTION_TYPE_OPTIONS = [
  { value: 'first_time', label: 'First time' },
  { value: 'recurring', label: 'Recurring' },
] as const;

export const RETENTION_GRANULARITY_OPTIONS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
] as const;
