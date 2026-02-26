import type { FunnelWidgetConfig } from '@/api/generated/Api';
import { defaultDateRange } from '@/lib/date-utils';

export function defaultFunnelConfig(step1Label = 'Step 1', step2Label = 'Step 2'): FunnelWidgetConfig {
  const { from, to } = defaultDateRange();
  return {
    type: 'funnel',
    steps: [
      { event_name: '', label: step1Label },
      { event_name: '', label: step2Label },
    ],
    conversion_window_days: 14,
    date_from: from,
    date_to: to,
    conversion_window_value: 14,
    conversion_window_unit: 'day',
    funnel_order_type: 'ordered',
    funnel_viz_type: 'steps',
    conversion_rate_display: 'total',
    exclusions: [],
  };
}

