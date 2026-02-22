import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { WebAnalyticsControllerGetSourcesParams } from '@/api/generated/Api';

export function useWebSources(params: WebAnalyticsControllerGetSourcesParams) {
  return useQuery({
    queryKey: ['web-analytics', 'sources', params],
    queryFn: () => api.webAnalyticsControllerGetSources(params),
    enabled: !!params.project_id,
  });
}
