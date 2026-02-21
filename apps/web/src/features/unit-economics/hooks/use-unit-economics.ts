import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { UnitEconomicsControllerGetUnitEconomicsParams } from '@/api/generated/Api';

function useProjectId() {
  const [searchParams] = useSearchParams();
  return searchParams.get('project') || '';
}

export function useUnitEconomics(
  params: Omit<UnitEconomicsControllerGetUnitEconomicsParams, 'project_id'> | null,
) {
  const projectId = useProjectId();
  return useQuery({
    queryKey: ['unitEconomics', projectId, params],
    queryFn: () =>
      api.unitEconomicsControllerGetUnitEconomics({
        project_id: projectId,
        ...params!,
      }),
    enabled: !!projectId && params !== null,
  });
}
