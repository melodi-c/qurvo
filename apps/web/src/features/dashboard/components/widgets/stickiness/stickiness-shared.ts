import type { StickinessWidgetConfig } from '@/api/generated/Api';

export function defaultStickinessConfig(): StickinessWidgetConfig {
  return {
    type: 'stickiness',
    target_event: '',
    granularity: 'day',
    date_from: '-30d',
    date_to: '-0d',
  };
}

export const STICKINESS_GRANULARITY_OPTIONS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
] as const;
