import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useProjectId } from '@/hooks/use-project-id';
import { useMutationErrorHandler } from '@/hooks/use-mutation-error-handler';
import type { Annotation, CreateAnnotation, UpdateAnnotation } from '@/api/generated/Api';

export function useAnnotations(dateFrom?: string, dateTo?: string): {
  data: Annotation[] | undefined;
  isLoading: boolean;
} {
  const projectId = useProjectId();

  const query = useQuery({
    queryKey: ['annotations', projectId, dateFrom, dateTo],
    queryFn: () =>
      api.annotationsControllerList({
        projectId,
        ...(dateFrom ? { date_from: dateFrom } : {}),
        ...(dateTo ? { date_to: dateTo } : {}),
      }),
    enabled: !!projectId,
  });

  return { data: query.data, isLoading: query.isLoading };
}

export function useCreateAnnotation() {
  const projectId = useProjectId();
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler();

  return useMutation({
    mutationFn: (data: CreateAnnotation) =>
      api.annotationsControllerCreate({ projectId }, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['annotations', projectId] });
    },
    onError: onError('createAnnotationFailed'),
  });
}

export function useUpdateAnnotation() {
  const projectId = useProjectId();
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAnnotation }) =>
      api.annotationsControllerUpdate({ projectId, id }, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['annotations', projectId] });
    },
    onError: onError('updateAnnotationFailed'),
  });
}

export function useDeleteAnnotation() {
  const projectId = useProjectId();
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler();

  return useMutation({
    mutationFn: (id: string) =>
      api.annotationsControllerRemove({ projectId, id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['annotations', projectId] });
    },
    onError: onError('deleteAnnotationFailed'),
  });
}
