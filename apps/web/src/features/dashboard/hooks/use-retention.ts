import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { RetentionWidgetConfig, RetentionResponse } from '@/api/generated/Api';

const STALE_AFTER_MS = 30 * 60 * 1000; // 30 minutes

function configHash(config: RetentionWidgetConfig): string {
  return JSON.stringify({
    target_event: config.target_event,
    retention_type: config.retention_type,
    granularity: config.granularity,
    periods: config.periods,
    from: config.date_from,
    to: config.date_to,
    cohort_ids: config.cohort_ids,
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useRetentionData(config: RetentionWidgetConfig, widgetId: string) {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const qc = useQueryClient();
  const autoRefreshTriggered = useRef(false);
  const widgetUuid = UUID_RE.test(widgetId) ? widgetId : undefined;

  const enabled = !!projectId && config.target_event.trim() !== '';

  const hash = configHash(config);
  const queryKey = ['retention', projectId, widgetId, hash];

  const query = useQuery<RetentionResponse>({
    queryKey,
    queryFn: () =>
      api.retentionControllerGetRetention({
        project_id: projectId,
        target_event: config.target_event,
        retention_type: config.retention_type,
        granularity: config.granularity,
        periods: config.periods,
        date_from: config.date_from,
        date_to: config.date_to,
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
      refreshRetention();
    }
  }, [query.data?.cached_at]);

  // Reset auto-refresh flag when widgetId/config changes
  useEffect(() => {
    autoRefreshTriggered.current = false;
  }, [widgetId, hash]);

  const refreshRetention = async () => {
    const result = await api.retentionControllerGetRetention({
      project_id: projectId,
      target_event: config.target_event,
      retention_type: config.retention_type,
      granularity: config.granularity,
      periods: config.periods,
      date_from: config.date_from,
      date_to: config.date_to,
      ...(widgetUuid ? { widget_id: widgetUuid } : {}),
      ...(config.cohort_ids?.length ? { cohort_ids: config.cohort_ids } : {}),
      force: true,
    });

    qc.setQueryData(queryKey, result);
    return result;
  };

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isPlaceholderData: query.isPlaceholderData,
    error: query.error,
    refresh: refreshRetention,
  };
}
