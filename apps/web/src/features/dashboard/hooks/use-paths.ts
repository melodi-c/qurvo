import { api } from '@/api/client';
import type { PathsWidgetConfig, PathsResponse, PathsControllerGetPathsParams } from '@/api/generated/Api';
import { createWidgetDataHook } from './create-widget-data-hook';

export const usePathsData = createWidgetDataHook<PathsWidgetConfig, PathsResponse, PathsControllerGetPathsParams>({
  queryKeyPrefix: 'paths',
  apiFn: (params) => api.pathsControllerGetPaths(params),
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
      filters: config.filters,
      cohort_ids: config.cohort_ids,
    }),
  isEnabled: () => true,
  buildParams: (config, projectId, widgetUuid, timezone) => ({
    project_id: projectId,
    date_from: config.date_from,
    date_to: config.date_to,
    step_limit: config.step_limit,
    ...(timezone && timezone !== 'UTC' ? { timezone } : {}),
    ...(config.start_event ? { start_event: config.start_event } : {}),
    ...(config.end_event ? { end_event: config.end_event } : {}),
    ...(config.exclusions?.length ? { exclusions: config.exclusions } : {}),
    ...(config.min_persons ? { min_persons: config.min_persons } : {}),
    ...(config.path_cleaning_rules?.length ? { path_cleaning_rules: config.path_cleaning_rules } : {}),
    ...(config.wildcard_groups?.length ? { wildcard_groups: config.wildcard_groups } : {}),
    ...(config.filters?.length ? { event_filters: config.filters } : {}),
    ...(widgetUuid ? { widget_id: widgetUuid } : {}),
    ...(config.cohort_ids?.length ? { cohort_ids: config.cohort_ids } : {}),
  }),
});
