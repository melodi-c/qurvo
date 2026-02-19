import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';

export function useEventNames() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';

  return useQuery({
    queryKey: ['event-names', projectId],
    queryFn: async () => {
      const result = await api.analyticsControllerGetEventNames({ project_id: projectId });
      return result.event_names;
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
