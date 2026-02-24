import { api } from '@/api/client';
import type { LifecycleWidgetConfig, LifecycleResponse, LifecycleControllerGetLifecycleParams } from '@/api/generated/Api';
import { createWidgetDataHook } from './create-widget-data-hook';

export const useLifecycleData = createWidgetDataHook<LifecycleWidgetConfig, LifecycleResponse, LifecycleControllerGetLifecycleParams>({
  queryKeyPrefix: 'lifecycle',
  apiFn: (params) => api.lifecycleControllerGetLifecycle(params),
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
