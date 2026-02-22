import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { EventDefinition } from '@/api/generated/Api';

export function useEventDefinitions() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';

  return useQuery({
    queryKey: ['event-definitions', projectId],
    queryFn: async () => {
      return api.eventDefinitionsControllerList({ projectId });
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
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
