import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { CreateInsight, UpdateInsight, InsightType } from '@/api/generated/Api';

function useProjectId() {
  const [searchParams] = useSearchParams();
  return searchParams.get('project') || '';
}

export function useInsights(type?: InsightType) {
  const projectId = useProjectId();
  return useQuery({
    queryKey: ['insights', projectId, type],
    queryFn: () =>
      api.insightsControllerList({ projectId, type }),
    enabled: !!projectId,
  });
}

export function useInsight(insightId: string) {
  const projectId = useProjectId();
  return useQuery({
    queryKey: ['insight', insightId],
    queryFn: () => api.insightsControllerGetById({ projectId, insightId }),
    enabled: !!insightId && !!projectId,
  });
}

export function useCreateInsight() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateInsight) =>
      api.insightsControllerCreate({ projectId }, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insights', projectId] });
    },
  });
}

export function useUpdateInsight() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ insightId, data }: { insightId: string; data: UpdateInsight }) =>
      api.insightsControllerUpdate({ projectId, insightId }, data),
    onSuccess: (_data, { insightId }) => {
      qc.invalidateQueries({ queryKey: ['insights', projectId] });
      qc.invalidateQueries({ queryKey: ['insight', insightId] });
    },
  });
}

export function useToggleFavorite() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ insightId, is_favorite }: { insightId: string; is_favorite: boolean }) =>
      api.insightsControllerUpdate({ projectId, insightId }, { is_favorite }),
    onMutate: async ({ insightId, is_favorite }) => {
      await qc.cancelQueries({ queryKey: ['insights', projectId] });
      const prev = qc.getQueryData(['insights', projectId]);
      qc.setQueryData(['insights', projectId], (old: any[]) =>
        old?.map((i: any) => (i.id === insightId ? { ...i, is_favorite } : i)),
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData(['insights', projectId], context.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['insights', projectId] });
    },
  });
}

export function useDeleteInsight() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (insightId: string) =>
      api.insightsControllerRemove({ projectId, insightId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insights', projectId] });
    },
  });
}
