import { api } from '@/api/client';
import type { RetentionWidgetConfig, RetentionResponse, RetentionControllerGetRetentionParams } from '@/api/generated/Api';
import { createWidgetDataHook } from './create-widget-data-hook';

export const useRetentionData = createWidgetDataHook<RetentionWidgetConfig, RetentionResponse, RetentionControllerGetRetentionParams>({
  queryKeyPrefix: 'retention',
  apiFn: (params) => api.retentionControllerGetRetention(params),
  configHash: (config) =>
    JSON.stringify({
      target_event: config.target_event,
      retention_type: config.retention_type,
      granularity: config.granularity,
      periods: config.periods,
      from: config.date_from,
      to: config.date_to,
      cohort_ids: config.cohort_ids,
    }),
  isEnabled: (config) => config.target_event.trim() !== '',
  buildParams: (config, projectId, widgetUuid) => ({
    project_id: projectId,
    target_event: config.target_event,
    retention_type: config.retention_type,
    granularity: config.granularity,
    periods: config.periods,
    date_from: config.date_from,
    date_to: config.date_to,
    ...(widgetUuid ? { widget_id: widgetUuid } : {}),
    ...(config.cohort_ids?.length ? { cohort_ids: config.cohort_ids } : {}),
  }),
});
