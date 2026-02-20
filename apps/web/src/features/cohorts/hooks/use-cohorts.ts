import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { CreateCohort, UpdateCohort, CohortDefinition } from '@/api/generated/Api';

export function useCohorts() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';

  return useQuery({
    queryKey: ['cohorts', projectId],
    queryFn: () => api.cohortsControllerList({ projectId }),
    enabled: !!projectId,
  });
}

export function useCohort(cohortId: string) {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';

  return useQuery({
    queryKey: ['cohorts', projectId, cohortId],
    queryFn: () => api.cohortsControllerGetById({ projectId, cohortId }),
    enabled: !!projectId && !!cohortId,
  });
}

export function useCreateCohort() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCohort) =>
      api.cohortsControllerCreate({ projectId }, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cohorts', projectId] });
    },
  });
}

export function useUpdateCohort() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ cohortId, data }: { cohortId: string; data: UpdateCohort }) =>
      api.cohortsControllerUpdate({ projectId, cohortId }, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cohorts', projectId] });
    },
  });
}

export function useDeleteCohort() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (cohortId: string) =>
      api.cohortsControllerRemove({ projectId, cohortId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cohorts', projectId] });
    },
  });
}

export function useCohortMemberCount(cohortId: string) {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';

  return useQuery({
    queryKey: ['cohorts', projectId, cohortId, 'count'],
    queryFn: () => api.cohortsControllerGetMemberCount({ projectId, cohortId }),
    enabled: !!projectId && !!cohortId,
  });
}

export function useCohortPreviewCount() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';

  return useMutation({
    mutationFn: (definition: CohortDefinition) =>
      api.cohortsControllerPreviewCount({ projectId }, { definition }),
  });
}
