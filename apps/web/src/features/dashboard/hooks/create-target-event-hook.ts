import type { BaseTargetEventConfig } from '../types';
import { createWidgetDataHook } from './create-widget-data-hook';

interface CachedResponse {
  cached_at: string;
}

interface TargetEventHookOptions<Config extends BaseTargetEventConfig, Response extends CachedResponse, Params> {
  queryKeyPrefix: string;
  apiFn: (params: Params) => Promise<Response>;
  /** Extra fields to include in the config hash (e.g. retention_type, periods) */
  extraHash?: (config: Config) => Record<string, unknown>;
  /** Extra fields to include in the API params */
  extraParams?: (config: Config) => Partial<Params>;
}

export function createTargetEventHook<
  Config extends BaseTargetEventConfig,
  Response extends CachedResponse,
  Params,
>(options: TargetEventHookOptions<Config, Response, Params>) {
  return createWidgetDataHook<Config, Response, Params>({
    queryKeyPrefix: options.queryKeyPrefix,
    apiFn: options.apiFn,
    configHash: (config) =>
      JSON.stringify({
        target_event: config.target_event,
        granularity: config.granularity,
        from: config.date_from,
        to: config.date_to,
        cohort_ids: config.cohort_ids,
        ...options.extraHash?.(config),
      }),
    isEnabled: (config) => config.target_event.trim() !== '',
    buildParams: (config, projectId, widgetUuid, timezone) => ({
      project_id: projectId,
      target_event: config.target_event,
      granularity: config.granularity,
      date_from: config.date_from,
      date_to: config.date_to,
      ...(timezone && timezone !== 'UTC' ? { timezone } : {}),
      ...(widgetUuid ? { widget_id: widgetUuid } : {}),
      ...(config.cohort_ids?.length ? { cohort_ids: config.cohort_ids } : {}),
      ...options.extraParams?.(config),
    } as Params),
  });
}
