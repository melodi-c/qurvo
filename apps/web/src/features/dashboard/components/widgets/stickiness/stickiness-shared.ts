import type { StickinessWidgetConfig } from '@/api/generated/Api';
import { todayIso } from '@/lib/date-utils';

export function defaultStickinessConfig(): StickinessWidgetConfig {
  return {
    type: 'stickiness',
    target_event: '',
    granularity: 'day',
    date_from: '-30d',
    date_to: todayIso(),
  };
}

export const STICKINESS_GRANULARITY_OPTIONS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
] as const;
