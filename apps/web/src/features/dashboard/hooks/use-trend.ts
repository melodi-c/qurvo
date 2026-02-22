import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { TrendWidgetConfig, TrendResponse } from '@/api/generated/Api';
import { refreshLimiter } from '../lib/refresh-limiter';

const STALE_AFTER_MS = 30 * 60 * 1000; // 30 minutes

/** Strip filters with empty property so they don't fail backend validation. */
function cleanSeries(config: TrendWidgetConfig) {
  return config.series.map((s) => ({
    ...s,
    filters: (s.filters ?? []).filter((f) => f.property.trim() !== ''),
  }));
}

function configHash(config: TrendWidgetConfig): string {
  return JSON.stringify({
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
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useTrendData(config: TrendWidgetConfig, widgetId: string) {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const qc = useQueryClient();
  const autoRefreshTriggered = useRef(false);
  const widgetUuid = UUID_RE.test(widgetId) ? widgetId : undefined;

  const enabled =
    !!projectId &&
    config.series.length >= 1 &&
    config.series.every((s) => s.event_name.trim() !== '');

  const hash = configHash(config);
  const queryKey = ['trend', projectId, widgetId, hash];

  const query = useQuery<TrendResponse>({
    queryKey,
    queryFn: () =>
      api.trendControllerGetTrend({
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
    enabled,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    gcTime: 2 * 60 * 60 * 1000,
  });

  // Auto-refresh if data is older than STALE_AFTER_MS
  useEffect(() => {
    if (!query.data || autoRefreshTriggered.current) return;
    const age = Date.now() - new Date(query.data.cached_at).getTime();
    if (age > STALE_AFTER_MS) {
      autoRefreshTriggered.current = true;
      refreshTrend();
    }
  }, [query.data?.cached_at]);

  // Reset auto-refresh flag when widgetId/config changes
  useEffect(() => {
    autoRefreshTriggered.current = false;
  }, [widgetId, hash]);

  const refreshTrend = () => refreshLimiter.run(async () => {
    const result = await api.trendControllerGetTrend({
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
      force: true,
    });

    qc.setQueryData(queryKey, result);
    return result;
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isPlaceholderData: query.isPlaceholderData,
    error: query.error,
    refresh: refreshTrend,
  };
}
