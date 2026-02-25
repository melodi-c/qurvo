import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { AiConversation } from '@/api/generated/Api';

export type { AiConversation as Conversation };

export function useConversations(projectId: string) {
  return useQuery<AiConversation[]>({
    queryKey: ['ai-conversations', projectId],
    queryFn: () => api.aiControllerListConversations({ project_id: projectId }),
    enabled: !!projectId,
  });
}

export function useRenameConversation(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      return api.aiControllerRenameConversation({ id, project_id: projectId }, { title });
    },
    onMutate: async ({ id, title }) => {
      await qc.cancelQueries({ queryKey: ['ai-conversations', projectId] });
      const previous = qc.getQueryData<AiConversation[]>(['ai-conversations', projectId]);
      qc.setQueryData<AiConversation[]>(['ai-conversations', projectId], (old) =>
        old ? old.map((c) => (c.id === id ? { ...c, title } : c)) : old,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(['ai-conversations', projectId], context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['ai-conversations', projectId] });
    },
  });
}

export function useDeleteConversation(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.aiControllerDeleteConversation({ id, project_id: projectId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-conversations', projectId] });
    },
  });
}
