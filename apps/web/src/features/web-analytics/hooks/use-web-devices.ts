import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { WebAnalyticsControllerGetDevicesParams } from '@/api/generated/Api';

export function useWebDevices(params: WebAnalyticsControllerGetDevicesParams) {
  return useQuery({
    queryKey: ['web-analytics', 'devices', params],
    queryFn: () => api.webAnalyticsControllerGetDevices(params),
    enabled: !!params.project_id,
  });
}
