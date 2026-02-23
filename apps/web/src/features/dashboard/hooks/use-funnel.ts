import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { FunnelWidgetConfig, FunnelResponse } from '@/api/generated/Api';
import { refreshLimiter } from '../lib/refresh-limiter';

const STALE_AFTER_MS = 30 * 60 * 1000; // 30 minutes

/** Strip filters with empty property so they don't fail backend validation. */
function cleanSteps(config: FunnelWidgetConfig) {
  return config.steps.map((s) => {
    const eventNames = (s.event_names ?? []).filter((n) => n.trim() !== '');
    return {
      ...s,
      filters: (s.filters ?? []).filter((f) => f.property.trim() !== ''),
      event_names: eventNames.length ? eventNames : undefined,
    };
  });
}

function configHash(config: FunnelWidgetConfig): string {
  return JSON.stringify({
    steps: config.steps,
    window: config.conversion_window_days,
    window_value: config.conversion_window_value,
    window_unit: config.conversion_window_unit,
    from: config.date_from,
    to: config.date_to,
    breakdown: config.breakdown_property,
    breakdown_type: config.breakdown_type,
    breakdown_cohort_ids: config.breakdown_cohort_ids,
    cohort_ids: config.cohort_ids,
    order_type: config.funnel_order_type,
    exclusions: config.exclusions,
    sampling_factor: config.sampling_factor,
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useFunnelData(config: FunnelWidgetConfig, widgetId: string) {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const qc = useQueryClient();
  const autoRefreshTriggered = useRef(false);
  const widgetUuid = UUID_RE.test(widgetId) ? widgetId : undefined;

  const enabled =
    !!projectId &&
    config.steps.length >= 2 &&
    config.steps.every((s) => s.event_name.trim() !== '' && s.label.trim() !== '');

  const hash = configHash(config);
  const queryKey = ['funnel', projectId, widgetId, hash];

  const query = useQuery<FunnelResponse>({
    queryKey,
    queryFn: () =>
      api.funnelControllerGetFunnel({
        project_id: projectId,
        steps: cleanSteps(config),
        conversion_window_days: config.conversion_window_days,
        ...(config.conversion_window_value != null ? { conversion_window_value: config.conversion_window_value } : {}),
        ...(config.conversion_window_unit ? { conversion_window_unit: config.conversion_window_unit } : {}),
        date_from: config.date_from,
        date_to: config.date_to,
        ...(config.breakdown_property ? { breakdown_property: config.breakdown_property } : {}),
        ...(config.breakdown_type ? { breakdown_type: config.breakdown_type } : {}),
        ...(config.breakdown_cohort_ids?.length ? { breakdown_cohort_ids: config.breakdown_cohort_ids } : {}),
        ...(widgetUuid ? { widget_id: widgetUuid } : {}),
        ...(config.cohort_ids?.length ? { cohort_ids: config.cohort_ids } : {}),
        ...(config.funnel_order_type ? { funnel_order_type: config.funnel_order_type } : {}),
        ...(config.exclusions?.length ? { exclusions: config.exclusions } : {}),
        ...(config.sampling_factor && config.sampling_factor < 1 ? { sampling_factor: config.sampling_factor } : {}),
      }),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: Infinity, // We handle staleness manually based on cached_at
    gcTime: 2 * 60 * 60 * 1000, // 2 hours
  });

  // Auto-refresh if data is older than STALE_AFTER_MS
  useEffect(() => {
    if (!query.data || autoRefreshTriggered.current) return;
    const age = Date.now() - new Date(query.data.cached_at).getTime();
    if (age > STALE_AFTER_MS) {
      autoRefreshTriggered.current = true;
      refreshFunnel();
    }
  }, [query.data?.cached_at]);

  // Reset auto-refresh flag when widgetId/config changes
  useEffect(() => {
    autoRefreshTriggered.current = false;
  }, [widgetId, hash]);

  const refreshFunnel = () => refreshLimiter.run(async () => {
    const result = await api.funnelControllerGetFunnel({
      project_id: projectId,
      steps: cleanSteps(config),
      conversion_window_days: config.conversion_window_days,
      ...(config.conversion_window_value != null ? { conversion_window_value: config.conversion_window_value } : {}),
      ...(config.conversion_window_unit ? { conversion_window_unit: config.conversion_window_unit } : {}),
      date_from: config.date_from,
      date_to: config.date_to,
      ...(config.breakdown_property ? { breakdown_property: config.breakdown_property } : {}),
      ...(config.breakdown_type ? { breakdown_type: config.breakdown_type } : {}),
      ...(config.breakdown_cohort_ids?.length ? { breakdown_cohort_ids: config.breakdown_cohort_ids } : {}),
      ...(widgetUuid ? { widget_id: widgetUuid } : {}),
      ...(config.cohort_ids?.length ? { cohort_ids: config.cohort_ids } : {}),
      ...(config.funnel_order_type ? { funnel_order_type: config.funnel_order_type } : {}),
      ...(config.exclusions?.length ? { exclusions: config.exclusions } : {}),
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
    refresh: refreshFunnel,
  };
}
