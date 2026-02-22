import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { WebAnalyticsControllerGetOverviewParams } from '@/api/generated/Api';

export function useWebOverview(params: WebAnalyticsControllerGetOverviewParams) {
  return useQuery({
    queryKey: ['web-analytics', 'overview', params],
    queryFn: () => api.webAnalyticsControllerGetOverview(params),
    enabled: !!params.project_id,
  });
}
