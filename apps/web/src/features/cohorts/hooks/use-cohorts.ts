import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProjectId } from '@/hooks/use-project-id';
import { api } from '@/api/client';
import type { CreateCohort, UpdateCohort, CohortPreview, CreateStaticCohort } from '@/api/generated/Api';

export function useCohorts() {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ['cohorts', projectId],
    queryFn: () => api.cohortsControllerList({ projectId }),
    enabled: !!projectId,
  });
}

export function useCohort(cohortId: string) {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ['cohorts', projectId, cohortId],
    queryFn: () => api.cohortsControllerGetById({ projectId, cohortId }),
    enabled: !!projectId && !!cohortId,
  });
}

export function useCreateCohort() {
  const projectId = useProjectId();
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
  const projectId = useProjectId();
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
  const projectId = useProjectId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (cohortId: string) =>
      api.cohortsControllerRemove({ projectId, cohortId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cohorts', projectId] });
    },
  });
}

export function useCohortSizeHistory(cohortId: string, days = 90) {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ['cohorts', projectId, cohortId, 'history', days],
    queryFn: () => api.cohortsControllerGetSizeHistory({ projectId, cohortId, days }),
    enabled: !!projectId && !!cohortId,
  });
}

export function useCohortMemberCount(cohortId: string) {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ['cohorts', projectId, cohortId, 'count'],
    queryFn: () => api.cohortsControllerGetMemberCount({ projectId, cohortId }),
    enabled: !!projectId && !!cohortId,
  });
}

export function useCohortPreviewCount() {
  const projectId = useProjectId();

  return useMutation({
    mutationFn: (data: CohortPreview) =>
      api.cohortsControllerPreviewCount({ projectId }, data),
  });
}

export function useCreateStaticCohort() {
  const projectId = useProjectId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateStaticCohort) =>
      api.staticCohortsControllerCreateStaticCohort({ projectId }, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cohorts', projectId] });
    },
  });
}

export function useDuplicateAsStatic() {
  const projectId = useProjectId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (cohortId: string) =>
      api.staticCohortsControllerDuplicateAsStatic({ projectId, cohortId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cohorts', projectId] });
    },
  });
}

export function useUploadCohortCsv() {
  const projectId = useProjectId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ cohortId, csvContent }: { cohortId: string; csvContent: string }) =>
      api.staticCohortsControllerUploadCsv({ projectId, cohortId }, { csv_content: csvContent }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cohorts', projectId] });
    },
  });
}
