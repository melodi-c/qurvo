import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type {
  WebAnalyticsControllerGetOverviewParams,
  WebAnalyticsControllerGetPathsParams,
  WebAnalyticsControllerGetSourcesParams,
  WebAnalyticsControllerGetDevicesParams,
  WebAnalyticsControllerGetGeographyParams,
} from '@/api/generated/Api';

export function useWebOverview(params: WebAnalyticsControllerGetOverviewParams) {
  return useQuery({
    queryKey: ['web-analytics', 'overview', params],
    queryFn: () => api.webAnalyticsControllerGetOverview(params),
    enabled: !!params.project_id,
  });
}

export function useWebPaths(params: WebAnalyticsControllerGetPathsParams) {
  return useQuery({
    queryKey: ['web-analytics', 'paths', params],
    queryFn: () => api.webAnalyticsControllerGetPaths(params),
    enabled: !!params.project_id,
  });
}

export function useWebSources(params: WebAnalyticsControllerGetSourcesParams) {
  return useQuery({
    queryKey: ['web-analytics', 'sources', params],
    queryFn: () => api.webAnalyticsControllerGetSources(params),
    enabled: !!params.project_id,
  });
}

export function useWebDevices(params: WebAnalyticsControllerGetDevicesParams) {
  return useQuery({
    queryKey: ['web-analytics', 'devices', params],
    queryFn: () => api.webAnalyticsControllerGetDevices(params),
    enabled: !!params.project_id,
  });
}

export function useWebGeography(params: WebAnalyticsControllerGetGeographyParams) {
  return useQuery({
    queryKey: ['web-analytics', 'geography', params],
    queryFn: () => api.webAnalyticsControllerGetGeography(params),
    enabled: !!params.project_id,
  });
}
