import { api } from '@/api/client';
import type {
  TrendWidgetConfig,
  TrendAggregateResponse,
  TrendControllerGetTrendAggregateParams,
  AggregateType,
} from '@/api/generated/Api';
import { createWidgetDataHook } from './create-widget-data-hook';
import { cleanSeries } from './use-trend';
import { CUSTOM_QUERY_CHART_TYPES } from '../components/widgets/trend/trend-shared';

function isAggregateType(chartType: string): chartType is AggregateType {
  return CUSTOM_QUERY_CHART_TYPES.includes(chartType as AggregateType);
}

export const useTrendAggregateData = createWidgetDataHook<
  TrendWidgetConfig,
  TrendAggregateResponse,
  TrendControllerGetTrendAggregateParams
>({
  queryKeyPrefix: 'trend-aggregate',
  apiFn: (params) => api.trendControllerGetTrendAggregate(params),
  configHash: (config) =>
    JSON.stringify({
      series: config.series.map(({ hidden: _hidden, ...rest }) => rest),
      from: config.date_from,
      to: config.date_to,
      chart_type: config.chart_type,
      cohort_ids: config.cohort_ids,
    }),
  isEnabled: (config) =>
    isAggregateType(config.chart_type) &&
    config.series.length >= 1 &&
    config.series.every((s) => s.event_name.trim() !== ''),
  buildParams: (config, projectId, widgetUuid) => ({
    project_id: projectId,
    aggregate_type: config.chart_type as AggregateType,
    series: cleanSeries(config).map(({ event_name, label, filters }) => ({
      event_name,
      label,
      ...(filters?.length ? { filters } : {}),
    })),
    date_from: config.date_from,
    date_to: config.date_to,
    ...(widgetUuid ? { widget_id: widgetUuid } : {}),
    ...(config.cohort_ids?.length ? { cohort_ids: config.cohort_ids } : {}),
  }),
});
