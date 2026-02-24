import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useProjectId } from '@/hooks/use-project-id';
import type { PropertyDefinition, TypeEnum1, UpsertPropertyDefinition } from '@/api/generated/Api';

export const propertyDefinitionsKey = (projectId: string, type?: string, eventName?: string) =>
  ['property-definitions', projectId, type ?? '', eventName ?? ''];

export function usePropertyDefinitions(type?: TypeEnum1, eventName?: string) {
  const projectId = useProjectId();

  return useQuery({
    queryKey: propertyDefinitionsKey(projectId, type, eventName),
    queryFn: async () => {
      const res = await api.propertyDefinitionsControllerList({
        projectId,
        type,
        event_name: eventName,
      });
      return res.items;
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpsertPropertyDefinition() {
  const projectId = useProjectId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      propertyName,
      propertyType,
      data,
    }: {
      propertyName: string;
      propertyType: 'event' | 'person';
      data: UpsertPropertyDefinition;
    }) =>
      api.propertyDefinitionsControllerUpsert(
        { projectId, propertyType, propertyName },
        data,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['property-definitions', projectId] });
    },
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
