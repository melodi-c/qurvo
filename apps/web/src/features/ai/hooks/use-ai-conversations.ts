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

export function useDeleteConversation(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.aiControllerDeleteConversation({ id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-conversations', projectId] });
    },
  });
}
