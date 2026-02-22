import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { UpsertPropertyDefinition } from '@/api/generated/Api';

export function usePropertyDefinitions(type?: 'event' | 'person') {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';

  return useQuery({
    queryKey: ['propertyDefinitions', projectId, type],
    queryFn: () => api.propertyDefinitionsControllerList({ projectId, type }),
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
      qc.invalidateQueries({ queryKey: ['propertyDefinitions', projectId] });
    },
  });
}
