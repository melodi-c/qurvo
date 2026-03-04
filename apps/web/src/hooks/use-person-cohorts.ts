import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';

export function usePersonCohorts(projectId: string, personId: string | undefined) {
  return useQuery({
    queryKey: ['person-cohorts', projectId, personId],
    queryFn: () =>
      api.personsControllerGetPersonCohorts({
        personId: personId!,
        project_id: projectId,
      }),
    enabled: !!projectId && !!personId,
  });
}
