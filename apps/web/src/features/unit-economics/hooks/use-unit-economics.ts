import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { UnitEconomicsQuery } from '@/api/generated/Api';

function useProjectId() {
  const [searchParams] = useSearchParams();
  return searchParams.get('project') || '';
}

export function useUnitEconomics(
  params: Omit<UnitEconomicsQuery, 'project_id'> | null,
) {
  const projectId = useProjectId();
  return useQuery({
    queryKey: ['unitEconomics', projectId, params],
    queryFn: () =>
      api.analyticsControllerGetUnitEconomics({
        project_id: projectId,
        ...params!,
      }),
    enabled: !!projectId && params !== null,
  });
}
