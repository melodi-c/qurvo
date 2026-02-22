import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';

export function usePersonPropertyNames() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';

  return useQuery({
    queryKey: ['person-property-names', projectId],
    queryFn: async () => {
      const result = await api.personsControllerGetPersonPropertyNames({ project_id: projectId });
      return result.property_names;
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}
