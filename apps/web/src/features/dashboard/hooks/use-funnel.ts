import { api } from '@/api/client';
import type { FunnelWidgetConfig, FunnelResponse, FunnelControllerGetFunnelParams } from '@/api/generated/Api';
import { createWidgetDataHook } from './create-widget-data-hook';

/** Strip filters with empty property so they don't fail backend validation. */
export function cleanSteps(config: FunnelWidgetConfig) {
  return config.steps.map((s) => {
    const eventNames = (s.event_names ?? []).filter((n) => n.trim() !== '');
    return {
      ...s,
      filters: (s.filters ?? []).filter((f) => f.property.trim() !== ''),
      event_names: eventNames.length ? eventNames : undefined,
    };
  });
}

export const useFunnelData = createWidgetDataHook<FunnelWidgetConfig, FunnelResponse, FunnelControllerGetFunnelParams>({
  queryKeyPrefix: 'funnel',
  apiFn: (params) => api.funnelControllerGetFunnel(params),
  configHash: (config) =>
    JSON.stringify({
      steps: config.steps,
      window: config.conversion_window_days,
      window_value: config.conversion_window_value,
      window_unit: config.conversion_window_unit,
      from: config.date_from,
      to: config.date_to,
      breakdown: config.breakdown_property,
      breakdown_type: config.breakdown_type,
      breakdown_cohort_ids: config.breakdown_cohort_ids,
      cohort_ids: config.cohort_ids,
      order_type: config.funnel_order_type,
      exclusions: config.exclusions,
      sampling_factor: config.sampling_factor,
    }),
  isEnabled: (config) =>
    config.steps.length >= 2 &&
    config.steps.every((s) => s.event_name.trim() !== '' && s.label.trim() !== ''),
  buildParams: (config, projectId, widgetUuid, timezone) => ({
    project_id: projectId,
    steps: cleanSteps(config),
    conversion_window_days: config.conversion_window_days,
    ...(config.conversion_window_value !== null && config.conversion_window_value !== undefined ? { conversion_window_value: config.conversion_window_value } : {}),
    ...(config.conversion_window_unit ? { conversion_window_unit: config.conversion_window_unit } : {}),
    date_from: config.date_from,
    date_to: config.date_to,
    ...(timezone && timezone !== 'UTC' ? { timezone } : {}),
    ...(config.breakdown_property ? { breakdown_property: config.breakdown_property } : {}),
    ...(config.breakdown_type ? { breakdown_type: config.breakdown_type } : {}),
    ...(config.breakdown_cohort_ids?.length ? { breakdown_cohort_ids: config.breakdown_cohort_ids } : {}),
    ...(widgetUuid ? { widget_id: widgetUuid } : {}),
    ...(config.cohort_ids?.length ? { cohort_ids: config.cohort_ids } : {}),
    ...(config.funnel_order_type ? { funnel_order_type: config.funnel_order_type } : {}),
    ...(config.exclusions?.length ? { exclusions: config.exclusions } : {}),
    ...(config.sampling_factor && config.sampling_factor < 1 ? { sampling_factor: config.sampling_factor } : {}),
  }),
});
