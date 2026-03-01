import type { RetentionWidgetConfig } from '@/api/generated/Api';
import { todayIso } from '@/lib/date-utils';

export function defaultRetentionConfig(): RetentionWidgetConfig {
  return {
    type: 'retention',
    target_event: '',
    retention_type: 'first_time',
    granularity: 'day',
    periods: 11,
    date_from: '-30d',
    date_to: todayIso(),
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
