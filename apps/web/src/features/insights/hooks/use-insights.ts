import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useProjectId } from '@/hooks/use-project-id';
import type { CreateInsight, UpdateInsight, InsightType, Insight } from '@/api/generated/Api';

export function useInsights(type?: InsightType) {
  const projectId = useProjectId();
  return useQuery({
    queryKey: ['insights', projectId, type],
    queryFn: () =>
      api.savedInsightsControllerList({ projectId, type }),
    enabled: !!projectId,
  });
}

export function useInsight(insightId: string) {
  const projectId = useProjectId();
  return useQuery({
    queryKey: ['insight', insightId],
    queryFn: () => api.savedInsightsControllerGetById({ projectId, insightId }),
    enabled: !!insightId && !!projectId,
  });
}

export function useCreateInsight() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateInsight) =>
      api.savedInsightsControllerCreate({ projectId }, data),
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
      api.savedInsightsControllerUpdate({ projectId, insightId }, data),
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
      api.savedInsightsControllerUpdate({ projectId, insightId }, { is_favorite }),
    onMutate: async ({ insightId, is_favorite }) => {
      await qc.cancelQueries({ queryKey: ['insights', projectId] });
      const prev = qc.getQueryData(['insights', projectId]);
      qc.setQueryData<Insight[]>(['insights', projectId], (old) =>
        old?.map((i) => (i.id === insightId ? { ...i, is_favorite } : i)),
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {qc.setQueryData(['insights', projectId], context.prev);}
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
      api.savedInsightsControllerRemove({ projectId, insightId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insights', projectId] });
    },
  });
}
