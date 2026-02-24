import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useProjectId } from '@/hooks/use-project-id';
import { refreshLimiter } from '../lib/refresh-limiter';

const STALE_AFTER_MS = 30 * 60 * 1000; // 30 minutes
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CachedResponse {
  cached_at: string;
}

interface WidgetDataHookOptions<Config, Response, Params> {
  queryKeyPrefix: string;
  apiFn: (params: Params) => Promise<Response>;
  buildParams: (config: Config, projectId: string, widgetUuid: string | undefined) => Params;
  configHash: (config: Config) => string;
  isEnabled: (config: Config) => boolean;
}

export interface WidgetDataResult<Response> {
  data: Response | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isPlaceholderData: boolean;
  error: Error | null;
  refresh: () => Promise<Response | undefined>;
}

export function createWidgetDataHook<Config, Response extends CachedResponse, Params>(
  options: WidgetDataHookOptions<Config, Response, Params>,
) {
  return function useWidgetData(config: Config, widgetId: string): WidgetDataResult<Response> {
    const projectId = useProjectId();
    const qc = useQueryClient();
    const autoRefreshTriggered = useRef(false);
    const widgetUuid = UUID_RE.test(widgetId) ? widgetId : undefined;

    const enabled = !!projectId && options.isEnabled(config);
    const hash = options.configHash(config);
    const queryKey = [options.queryKeyPrefix, projectId, widgetId, hash];

    const query = useQuery<Response>({
      queryKey,
      queryFn: () => options.apiFn(options.buildParams(config, projectId, widgetUuid)),
      enabled,
      placeholderData: keepPreviousData,
      staleTime: Infinity,
      gcTime: 2 * 60 * 60 * 1000,
    });

    const refresh = () => refreshLimiter.run(async () => {
      const params = options.buildParams(config, projectId, widgetUuid);
      const result = await options.apiFn({ ...params, force: true });
      qc.setQueryData(queryKey, result);
      return result;
    });

    // Auto-refresh if data is older than STALE_AFTER_MS
    useEffect(() => {
      if (!query.data || autoRefreshTriggered.current) return;
      const age = Date.now() - new Date(query.data.cached_at).getTime();
      if (age > STALE_AFTER_MS) {
        autoRefreshTriggered.current = true;
        refresh();
      }
    }, [query.data?.cached_at]);

    // Reset auto-refresh flag when widgetId/config changes
    useEffect(() => {
      autoRefreshTriggered.current = false;
    }, [widgetId, hash]);

    return {
      data: query.data,
      isLoading: query.isLoading,
      isFetching: query.isFetching,
      isPlaceholderData: query.isPlaceholderData,
      error: query.error,
      refresh,
    };
  };
}
