import type { FunnelWidgetConfig } from '@/api/generated/Api';

export function defaultFunnelConfig(): FunnelWidgetConfig {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return {
    type: 'funnel',
    steps: [
      { event_name: '', label: 'Step 1' },
      { event_name: '', label: 'Step 2' },
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

