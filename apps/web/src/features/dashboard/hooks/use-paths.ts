import { api } from '@/api/client';
import type { PathsWidgetConfig, PathsResponse } from '@/api/generated/Api';
import { createWidgetDataHook } from './create-widget-data-hook';

export const usePathsData = createWidgetDataHook<PathsWidgetConfig, PathsResponse>({
  queryKeyPrefix: 'paths',
  apiFn: (params) => api.pathsControllerGetPaths(params as any),
  configHash: (config) =>
    JSON.stringify({
      from: config.date_from,
      to: config.date_to,
      step_limit: config.step_limit,
      start_event: config.start_event,
      end_event: config.end_event,
      exclusions: config.exclusions,
      min_persons: config.min_persons,
      path_cleaning_rules: config.path_cleaning_rules,
      wildcard_groups: config.wildcard_groups,
      cohort_ids: config.cohort_ids,
    }),
  isEnabled: () => true,
  buildParams: (config, projectId, widgetUuid) => ({
    project_id: projectId,
    date_from: config.date_from,
    date_to: config.date_to,
    step_limit: config.step_limit,
    ...(config.start_event ? { start_event: config.start_event } : {}),
    ...(config.end_event ? { end_event: config.end_event } : {}),
    ...(config.exclusions?.length ? { exclusions: config.exclusions } : {}),
    ...(config.min_persons ? { min_persons: config.min_persons } : {}),
    ...(config.path_cleaning_rules?.length ? { path_cleaning_rules: config.path_cleaning_rules } : {}),
    ...(config.wildcard_groups?.length ? { wildcard_groups: config.wildcard_groups } : {}),
    ...(widgetUuid ? { widget_id: widgetUuid } : {}),
    ...(config.cohort_ids?.length ? { cohort_ids: config.cohort_ids } : {}),
  }),
});
