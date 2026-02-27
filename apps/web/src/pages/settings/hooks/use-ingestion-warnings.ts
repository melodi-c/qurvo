import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';

export function useIngestionWarnings(projectId: string) {
  return useQuery({
    queryKey: ['ingestionWarnings', projectId],
    queryFn: () => api.ingestionWarningsControllerGetIngestionWarnings({ project_id: projectId, limit: 100 }),
    enabled: !!projectId,
  });
}
