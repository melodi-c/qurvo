import { useQuery } from '@tanstack/react-query';
import { useProjectId } from '@/hooks/use-project-id';
import { api } from '@/api/client';

export function useEventNames() {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ['event-names', projectId],
    queryFn: async () => {
      const result = await api.eventsControllerGetEventNames({ project_id: projectId });
      return result.event_names;
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
