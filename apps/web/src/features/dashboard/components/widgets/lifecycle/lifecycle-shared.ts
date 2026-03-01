import type { LifecycleWidgetConfig } from '@/api/generated/Api';
import { todayIso } from '@/lib/date-utils';

export function defaultLifecycleConfig(): LifecycleWidgetConfig {
  return {
    type: 'lifecycle',
    target_event: '',
    granularity: 'day',
    date_from: '-30d',
    date_to: todayIso(),
  };
}

export const LIFECYCLE_GRANULARITY_OPTIONS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
] as const;

export const LIFECYCLE_STATUS_COLORS = {
  new: '#22c55e',
  returning: '#3b82f6',
  resurrecting: '#f97316',
  dormant: '#ef4444',
} as const;
