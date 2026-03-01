import { api } from '@/api/client';
import type {
  FunnelWidgetConfig,
  TimeToConvertResponse,
  FunnelControllerGetFunnelTimeToConvertParams,
} from '@/api/generated/Api';
import { cleanSteps } from './use-funnel';
import { createWidgetDataHook } from './create-widget-data-hook';

export interface TimeToConvertConfig extends FunnelWidgetConfig {
  from_step: number;
  to_step: number;
}

export const useFunnelTimeToConvertData = createWidgetDataHook<
  TimeToConvertConfig,
  TimeToConvertResponse,
  FunnelControllerGetFunnelTimeToConvertParams
>({
  queryKeyPrefix: 'funnel-time-to-convert',
  apiFn: (params) => api.funnelControllerGetFunnelTimeToConvert(params),
  configHash: (config) =>
    JSON.stringify({
      steps: config.steps,
      window: config.conversion_window_days,
      window_value: config.conversion_window_value,
      window_unit: config.conversion_window_unit,
      from: config.date_from,
      to: config.date_to,
      cohort_ids: config.cohort_ids,
      from_step: config.from_step,
      to_step: config.to_step,
      sampling_factor: config.sampling_factor,
    }),
  isEnabled: (config) =>
    config.steps.length >= 2 &&
    config.steps.every((s) => s.event_name.trim() !== '' && s.label.trim() !== '') &&
    config.from_step < config.to_step,
  buildParams: (config, projectId, widgetUuid) => ({
    project_id: projectId,
    steps: cleanSteps(config),
    conversion_window_days: config.conversion_window_days,
    ...(config.conversion_window_value !== null && config.conversion_window_value !== undefined ? { conversion_window_value: config.conversion_window_value } : {}),
    ...(config.conversion_window_unit ? { conversion_window_unit: config.conversion_window_unit } : {}),
    date_from: config.date_from,
    date_to: config.date_to,
    from_step: config.from_step,
    to_step: config.to_step,
    ...(widgetUuid ? { widget_id: widgetUuid } : {}),
    ...(config.cohort_ids?.length ? { cohort_ids: config.cohort_ids } : {}),
    ...(config.sampling_factor && config.sampling_factor < 1 ? { sampling_factor: config.sampling_factor } : {}),
  }),
});
