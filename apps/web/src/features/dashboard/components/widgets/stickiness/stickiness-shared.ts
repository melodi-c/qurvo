import type { StickinessWidgetConfig } from '@/api/generated/Api';
import { defaultDateRange } from '@/lib/date-utils';

export function defaultStickinessConfig(): StickinessWidgetConfig {
  const { from, to } = defaultDateRange();
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
