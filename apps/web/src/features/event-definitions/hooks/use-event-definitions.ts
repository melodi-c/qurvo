import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { UpsertEventDefinition } from '@/api/generated/Api';

export function useEventDefinitions() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';

  return useQuery({
    queryKey: ['eventDefinitions', projectId],
    queryFn: () => api.eventDefinitionsControllerList({ projectId }).then(r => r.items),
    enabled: !!projectId,
  });
}

export function useUpsertEventDefinition() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ eventName, data }: { eventName: string; data: UpsertEventDefinition }) =>
      api.eventDefinitionsControllerUpsert(
        { projectId, eventName },
        data,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['eventDefinitions', projectId] });
    },
  });
}
