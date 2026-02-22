import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';

export function useEventPropertyNames() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';

  return useQuery({
    queryKey: ['event-property-names', projectId],
    queryFn: async () => {
      const result = await api.eventsControllerGetEventPropertyNames({ project_id: projectId });
      return result.property_names;
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}
