import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { WebAnalyticsControllerGetPathsParams } from '@/api/generated/Api';

export function useWebPaths(params: WebAnalyticsControllerGetPathsParams) {
  return useQuery({
    queryKey: ['web-analytics', 'paths', params],
    queryFn: () => api.webAnalyticsControllerGetPaths(params),
    enabled: !!params.project_id,
  });
}
