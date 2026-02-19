import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { FunnelWidgetConfig, FunnelCacheEntry } from '../types';

const STALE_AFTER_MS = 30 * 60 * 1000; // 30 minutes

/** Strip filters with empty property so they don't fail backend validation. */
function cleanSteps(config: FunnelWidgetConfig) {
  return config.steps.map((s) => ({
    ...s,
    filters: (s.filters ?? []).filter((f) => f.property.trim() !== ''),
  }));
}

function configHash(config: FunnelWidgetConfig): string {
  return JSON.stringify({
    steps: config.steps,
    window: config.conversion_window_days,
    from: config.date_from,
    to: config.date_to,
    breakdown: config.breakdown_property,
  });
}

export function useFunnelData(config: FunnelWidgetConfig, widgetId: string) {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const qc = useQueryClient();
  const autoRefreshTriggered = useRef(false);

  const enabled =
    !!projectId &&
    config.steps.length >= 2 &&
    config.steps.every((s) => s.event_name.trim() !== '');

  const hash = configHash(config);
  const queryKey = ['funnel', projectId, widgetId, hash];

  const query = useQuery<FunnelCacheEntry>({
    queryKey,
    queryFn: () =>
      api.analyticsControllerGetFunnel({
        project_id: projectId,
        steps: cleanSteps(config),
        conversion_window_days: config.conversion_window_days,
        date_from: config.date_from,
        date_to: config.date_to,
        ...(config.breakdown_property ? { breakdown_property: config.breakdown_property } : {}),
        widget_id: widgetId,
      }),
    enabled,
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

  const refreshFunnel = async () => {
    const result = await api.analyticsControllerGetFunnel({
      project_id: projectId,
      steps: cleanSteps(config),
      conversion_window_days: config.conversion_window_days,
      date_from: config.date_from,
      date_to: config.date_to,
      ...(config.breakdown_property ? { breakdown_property: config.breakdown_property } : {}),
      widget_id: widgetId,
      force: true,
    });

    qc.setQueryData(queryKey, result);
    return result;
  };

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refresh: refreshFunnel,
  };
}
