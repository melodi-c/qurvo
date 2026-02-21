import type { StickinessWidgetConfig } from '@/api/generated/Api';

export function defaultStickinessConfig(): StickinessWidgetConfig {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return {
    type: 'stickiness',
    target_event: '',
    granularity: 'day',
    date_from: from,
    date_to: to,
  };
}

export const STICKINESS_GRANULARITY_OPTIONS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
] as const;
