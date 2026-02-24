import { api } from '@/api/client';
import type { StickinessWidgetConfig, StickinessResponse, StickinessControllerGetStickinessParams } from '@/api/generated/Api';
import { createWidgetDataHook } from './create-widget-data-hook';

export const useStickinessData = createWidgetDataHook<StickinessWidgetConfig, StickinessResponse, StickinessControllerGetStickinessParams>({
  queryKeyPrefix: 'stickiness',
  apiFn: (params) => api.stickinessControllerGetStickiness(params),
  configHash: (config) =>
    JSON.stringify({
      target_event: config.target_event,
      granularity: config.granularity,
      from: config.date_from,
      to: config.date_to,
      cohort_ids: config.cohort_ids,
    }),
  isEnabled: (config) => config.target_event.trim() !== '',
  buildParams: (config, projectId, widgetUuid) => ({
    project_id: projectId,
    target_event: config.target_event,
    granularity: config.granularity,
    date_from: config.date_from,
    date_to: config.date_to,
    ...(widgetUuid ? { widget_id: widgetUuid } : {}),
    ...(config.cohort_ids?.length ? { cohort_ids: config.cohort_ids } : {}),
  }),
});
