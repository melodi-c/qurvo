import type { RetentionWidgetConfig } from '@/api/generated/Api';
import { defaultDateRange } from '@/lib/date-utils';

export function defaultRetentionConfig(): RetentionWidgetConfig {
  const { from, to } = defaultDateRange();
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
