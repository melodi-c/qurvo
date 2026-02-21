import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { UpsertUEConfig, UEConfig } from '@/api/generated/Api';

function useProjectId() {
  const [searchParams] = useSearchParams();
  return searchParams.get('project') || '';
}

export function useUEConfig() {
  const projectId = useProjectId();
  return useQuery({
    queryKey: ['ueConfig', projectId],
    queryFn: () => api.unitEconomicsConfigControllerGetConfig({ projectId }) as Promise<UEConfig | null>,
    enabled: !!projectId,
  });
}

export function useUpsertUEConfig() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpsertUEConfig) =>
      api.unitEconomicsConfigControllerUpsertConfig({ projectId }, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ueConfig', projectId] });
    },
  });
}
