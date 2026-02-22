import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { WebAnalyticsControllerGetGeographyParams } from '@/api/generated/Api';

export function useWebGeography(params: WebAnalyticsControllerGetGeographyParams) {
  return useQuery({
    queryKey: ['web-analytics', 'geography', params],
    queryFn: () => api.webAnalyticsControllerGetGeography(params),
    enabled: !!params.project_id,
  });
}
