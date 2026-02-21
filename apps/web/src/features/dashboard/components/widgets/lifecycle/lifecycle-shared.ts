import type { LifecycleWidgetConfig } from '@/api/generated/Api';

export function defaultLifecycleConfig(): LifecycleWidgetConfig {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return {
    type: 'lifecycle',
    target_event: '',
    granularity: 'day',
    date_from: from,
    date_to: to,
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
