import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useProjectId } from '@/hooks/use-project-id';
import type { EventDefinition, UpsertEventDefinition } from '@/api/generated/Api';

export const eventDefinitionsKey = (projectId: string) => ['event-definitions', projectId];

export function useEventDefinitions() {
  const projectId = useProjectId();

  return useQuery({
    queryKey: eventDefinitionsKey(projectId),
    queryFn: async () => {
      const res = await api.eventDefinitionsControllerList({ projectId });
      return res.items;
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpsertEventDefinition() {
  const projectId = useProjectId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ eventName, data }: { eventName: string; data: UpsertEventDefinition }) =>
      api.eventDefinitionsControllerUpsert(
        { projectId, eventName },
        data,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: eventDefinitionsKey(projectId) });
    },
  });
}

export function buildDescriptionMap(definitions: EventDefinition[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const def of definitions) {
    if (def.description) {
      map[def.event_name] = def.description;
    }
  }
  return map;
}
