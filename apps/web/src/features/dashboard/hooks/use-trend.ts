import { api } from '@/api/client';
import type { TrendWidgetConfig, TrendResponse, TrendControllerGetTrendParams } from '@/api/generated/Api';
import { createWidgetDataHook } from './create-widget-data-hook';

/** Strip filters with empty property so they don't fail backend validation. */
export function cleanSeries(config: TrendWidgetConfig) {
  return config.series.map((s) => ({
    ...s,
    filters: (s.filters ?? []).filter((f) => f.property.trim() !== ''),
  }));
}

export const useTrendData = createWidgetDataHook<TrendWidgetConfig, TrendResponse, TrendControllerGetTrendParams>({
  queryKeyPrefix: 'trend',
  apiFn: (params) => api.trendControllerGetTrend(params),
  configHash: (config) =>
    JSON.stringify({
      series: config.series.map(({ hidden: _hidden, ...rest }) => rest),
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
    granularity: config.granularity,
    date_from: config.date_from,
    date_to: config.date_to,
    ...(config.breakdown_property ? { breakdown_property: config.breakdown_property } : {}),
    ...(config.compare ? { compare: true } : {}),
    ...(widgetUuid ? { widget_id: widgetUuid } : {}),
    ...(config.cohort_ids?.length ? { cohort_ids: config.cohort_ids } : {}),
  }),
});
