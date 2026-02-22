import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { UpsertPropertyDefinition } from '@/api/generated/Api';

export function usePropertyDefinitions(type?: 'event' | 'person', eventName?: string) {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';

  return useQuery({
    queryKey: ['propertyDefinitions', projectId, type, eventName],
    queryFn: () => api.propertyDefinitionsControllerList({ projectId, type, event_name: eventName }),
    enabled: !!projectId,
  });
}

export function useUpsertPropertyDefinition() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      propertyName,
      propertyType,
      eventName,
      data,
    }: {
      propertyName: string;
      propertyType: 'event' | 'person';
      eventName: string;
      data: Omit<UpsertPropertyDefinition, 'event_name'>;
    }) =>
      api.propertyDefinitionsControllerUpsert(
        { projectId, propertyType, propertyName },
        { ...data, event_name: eventName },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['propertyDefinitions', projectId] });
    },
  });
}
