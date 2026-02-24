import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '@/lib/auth-fetch';

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export function useConversations(projectId: string) {
  return useQuery<Conversation[]>({
    queryKey: ['ai-conversations', projectId],
    queryFn: async () => {
      const res = await authFetch(`/api/ai/conversations?project_id=${projectId}`);
      if (!res.ok) throw new Error('Failed to load conversations');
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useDeleteConversation(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await authFetch(`/api/ai/conversations/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-conversations', projectId] });
    },
  });
}
