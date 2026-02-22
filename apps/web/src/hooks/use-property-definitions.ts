import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { PropertyDefinition, TypeEnum1 } from '@/api/generated/Api';

export function usePropertyDefinitions(type?: TypeEnum1, eventName?: string) {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';

  return useQuery({
    queryKey: ['property-definitions', projectId, type ?? '', eventName ?? ''],
    queryFn: async () => {
      return api.propertyDefinitionsControllerList({
        projectId,
        type,
        event_name: eventName,
      });
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}

export function buildPropertyDescriptionMap(definitions: PropertyDefinition[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const def of definitions) {
    if (def.description) {
      map[def.property_name] = def.description;
    }
  }
  return map;
}
