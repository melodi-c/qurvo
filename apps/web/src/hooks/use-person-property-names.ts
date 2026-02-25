import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useProjectId } from '@/hooks/use-project-id';
import { api } from '@/api/client';
import { usePropertyDefinitions, buildPropertyDescriptionMap } from '@/hooks/use-property-definitions';

export function usePersonPropertyNames() {
  const projectId = useProjectId();

  const namesQuery = useQuery({
    queryKey: ['person-property-names', projectId],
    queryFn: async () => {
      const result = await api.personsControllerGetPersonPropertyNames({ project_id: projectId });
      return result.property_names;
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: definitions = [] } = usePropertyDefinitions('person');
  const descriptions = useMemo(() => buildPropertyDescriptionMap(definitions), [definitions]);

  return {
    ...namesQuery,
    descriptions,
  };
}
