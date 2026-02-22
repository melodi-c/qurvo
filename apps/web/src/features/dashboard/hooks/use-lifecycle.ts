import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { LifecycleWidgetConfig, LifecycleResponse } from '@/api/generated/Api';
import { refreshLimiter } from '../lib/refresh-limiter';

const STALE_AFTER_MS = 30 * 60 * 1000;

function configHash(config: LifecycleWidgetConfig): string {
  return JSON.stringify({
    target_event: config.target_event,
    granularity: config.granularity,
    from: config.date_from,
    to: config.date_to,
    cohort_ids: config.cohort_ids,
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useLifecycleData(config: LifecycleWidgetConfig, widgetId: string) {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const qc = useQueryClient();
  const autoRefreshTriggered = useRef(false);
  const widgetUuid = UUID_RE.test(widgetId) ? widgetId : undefined;

  const enabled = !!projectId && config.target_event.trim() !== '';

  const hash = configHash(config);
  const queryKey = ['lifecycle', projectId, widgetId, hash];

  const query = useQuery<LifecycleResponse>({
    queryKey,
    queryFn: () =>
      api.lifecycleControllerGetLifecycle({
        project_id: projectId,
        target_event: config.target_event,
        granularity: config.granularity,
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

  useEffect(() => {
    if (!query.data || autoRefreshTriggered.current) return;
    const age = Date.now() - new Date(query.data.cached_at).getTime();
    if (age > STALE_AFTER_MS) {
      autoRefreshTriggered.current = true;
      refreshLifecycle();
    }
  }, [query.data?.cached_at]);

  useEffect(() => {
    autoRefreshTriggered.current = false;
  }, [widgetId, hash]);

  const refreshLifecycle = () => refreshLimiter.run(async () => {
    const result = await api.lifecycleControllerGetLifecycle({
      project_id: projectId,
      target_event: config.target_event,
      granularity: config.granularity,
      date_from: config.date_from,
      date_to: config.date_to,
      ...(widgetUuid ? { widget_id: widgetUuid } : {}),
      ...(config.cohort_ids?.length ? { cohort_ids: config.cohort_ids } : {}),
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
    refresh: refreshLifecycle,
  };
}
