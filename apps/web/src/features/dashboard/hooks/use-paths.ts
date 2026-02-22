import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { PathsWidgetConfig, PathsResponse } from '@/api/generated/Api';

const STALE_AFTER_MS = 30 * 60 * 1000;

function configHash(config: PathsWidgetConfig): string {
  return JSON.stringify({
    from: config.date_from,
    to: config.date_to,
    step_limit: config.step_limit,
    start_event: config.start_event,
    end_event: config.end_event,
    exclusions: config.exclusions,
    min_persons: config.min_persons,
    path_cleaning_rules: config.path_cleaning_rules,
    wildcard_groups: config.wildcard_groups,
    cohort_ids: config.cohort_ids,
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function usePathsData(config: PathsWidgetConfig, widgetId: string) {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const qc = useQueryClient();
  const autoRefreshTriggered = useRef(false);
  const widgetUuid = UUID_RE.test(widgetId) ? widgetId : undefined;

  const enabled = !!projectId;

  const hash = configHash(config);
  const queryKey = ['paths', projectId, widgetId, hash];

  const query = useQuery<PathsResponse>({
    queryKey,
    queryFn: () =>
      api.pathsControllerGetPaths({
        project_id: projectId,
        date_from: config.date_from,
        date_to: config.date_to,
        step_limit: config.step_limit,
        ...(config.start_event ? { start_event: config.start_event } : {}),
        ...(config.end_event ? { end_event: config.end_event } : {}),
        ...(config.exclusions?.length ? { exclusions: config.exclusions } : {}),
        ...(config.min_persons ? { min_persons: config.min_persons } : {}),
        ...(config.path_cleaning_rules?.length ? { path_cleaning_rules: config.path_cleaning_rules } : {}),
        ...(config.wildcard_groups?.length ? { wildcard_groups: config.wildcard_groups } : {}),
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
      refreshPaths();
    }
  }, [query.data?.cached_at]);

  useEffect(() => {
    autoRefreshTriggered.current = false;
  }, [widgetId, hash]);

  const refreshPaths = async () => {
    const result = await api.pathsControllerGetPaths({
      project_id: projectId,
      date_from: config.date_from,
      date_to: config.date_to,
      step_limit: config.step_limit,
      ...(config.start_event ? { start_event: config.start_event } : {}),
      ...(config.end_event ? { end_event: config.end_event } : {}),
      ...(config.exclusions?.length ? { exclusions: config.exclusions } : {}),
      ...(config.min_persons ? { min_persons: config.min_persons } : {}),
      ...(config.path_cleaning_rules?.length ? { path_cleaning_rules: config.path_cleaning_rules } : {}),
      ...(config.wildcard_groups?.length ? { wildcard_groups: config.wildcard_groups } : {}),
      ...(widgetUuid ? { widget_id: widgetUuid } : {}),
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
    refresh: refreshPaths,
  };
}
