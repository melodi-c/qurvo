import { api } from '@/api/client';
import type { TrendWidgetConfig, TrendResponse } from '@/api/generated/Api';
import { createWidgetDataHook } from './create-widget-data-hook';

/** Strip filters with empty property so they don't fail backend validation. */
function cleanSeries(config: TrendWidgetConfig) {
  return config.series.map((s) => ({
    ...s,
    filters: (s.filters ?? []).filter((f) => f.property.trim() !== ''),
  }));
}

export const useTrendData = createWidgetDataHook<TrendWidgetConfig, TrendResponse>({
  queryKeyPrefix: 'trend',
  apiFn: (params) => api.trendControllerGetTrend(params as any),
  configHash: (config) =>
    JSON.stringify({
      series: config.series,
      metric: config.metric,
      metric_property: config.metric_property,
      granularity: config.granularity,
      from: config.date_from,
      to: config.date_to,
      breakdown: config.breakdown_property,
      compare: config.compare,
      chart_type: config.chart_type,
      cohort_ids: config.cohort_ids,
      formulas: config.formulas,
    }),
  isEnabled: (config) =>
    config.series.length >= 1 &&
    config.series.every((s) => s.event_name.trim() !== ''),
  buildParams: (config, projectId, widgetUuid) => ({
    project_id: projectId,
    series: cleanSeries(config),
    metric: config.metric,
    granularity: config.granularity,
    date_from: config.date_from,
    date_to: config.date_to,
    ...(config.metric_property ? { metric_property: config.metric_property } : {}),
    ...(config.breakdown_property ? { breakdown_property: config.breakdown_property } : {}),
    ...(config.compare ? { compare: true } : {}),
    ...(widgetUuid ? { widget_id: widgetUuid } : {}),
    ...(config.cohort_ids?.length ? { cohort_ids: config.cohort_ids } : {}),
  }),
});
