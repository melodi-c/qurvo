import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useProjectId } from '@/hooks/use-project-id';
import { api } from '@/api/client';
import { useMutationErrorHandler } from '@/hooks/use-mutation-error-handler';
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
  const onError = useMutationErrorHandler();

  return useMutation({
    mutationFn: (data: CreateCohort) =>
      api.cohortsControllerCreate({ projectId }, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cohorts', projectId] });
    },
    onError: onError('createCohortFailed'),
  });
}

export function useUpdateCohort() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const onError = useMutationErrorHandler();

  return useMutation({
    mutationFn: ({ cohortId, data }: { cohortId: string; data: UpdateCohort }) =>
      api.cohortsControllerUpdate({ projectId, cohortId }, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cohorts', projectId] });
    },
    onError: onError('updateCohortFailed'),
  });
}

export function useDeleteCohort() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const onError = useMutationErrorHandler();

  return useMutation({
    mutationFn: (cohortId: string) =>
      api.cohortsControllerRemove({ projectId, cohortId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cohorts', projectId] });
    },
    onError: onError('deleteCohortFailed'),
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

/**
 * Query-based cohort preview that uses a definition hash as the query key.
 * Automatically cancels previous requests when the definition changes,
 * ensuring results never arrive out of order.
 */
export function useCohortPreviewQuery(definition: CohortPreview['definition'], hash: string, enabled: boolean) {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ['cohort-preview', projectId, hash],
    queryFn: () =>
      api.cohortsControllerPreviewCount({ projectId }, { definition }),
    enabled: enabled && !!projectId,
    placeholderData: keepPreviousData,
  });
}

export function useCreateStaticCohort() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const onError = useMutationErrorHandler();

  return useMutation({
    mutationFn: (data: CreateStaticCohort) =>
      api.staticCohortsControllerCreateStaticCohort({ projectId }, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cohorts', projectId] });
    },
    onError: onError('createStaticCohortFailed'),
  });
}

export function useDuplicateAsStatic() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const onError = useMutationErrorHandler();

  return useMutation({
    mutationFn: (cohortId: string) =>
      api.staticCohortsControllerDuplicateAsStatic({ projectId, cohortId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cohorts', projectId] });
    },
    onError: onError('duplicateAsStaticFailed'),
  });
}

export function useUploadCohortCsv() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const onError = useMutationErrorHandler();

  return useMutation({
    mutationFn: ({ cohortId, csvContent }: { cohortId: string; csvContent: string }) =>
      api.staticCohortsControllerUploadCsv({ projectId, cohortId }, { csv_content: csvContent }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cohorts', projectId] });
    },
    onError: onError('uploadCsvFailed'),
  });
}
