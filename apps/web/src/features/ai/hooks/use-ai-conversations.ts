import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { AiConversation, AiConversationDetail, AiConversationSearchResult } from '@/api/generated/Api';

export type { AiConversation as Conversation };
export type { AiConversationDetail };
export type { AiConversationSearchResult };

export interface AiQuotaInfo {
  ai_messages_per_month: number | null;
  ai_messages_used: number;
}

export function useAiQuota(projectId: string): AiQuotaInfo {
  const { data } = useQuery({
    queryKey: ['billing', projectId],
    queryFn: () => api.billingControllerGetStatus({ projectId }),
    enabled: !!projectId,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return {
    ai_messages_per_month: data?.ai_messages_per_month ?? null,
    ai_messages_used: data?.ai_messages_used ?? 0,
  };
}

export function useConversations(projectId: string) {
  return useQuery<AiConversation[]>({
    queryKey: ['ai-conversations', projectId],
    queryFn: () => api.aiControllerListConversations({ project_id: projectId }),
    enabled: !!projectId,
  });
}

export function useSharedConversations(projectId: string) {
  return useQuery<AiConversation[]>({
    queryKey: ['ai-conversations-shared', projectId],
    queryFn: () => api.aiControllerListConversations({ project_id: projectId, shared: true }),
    enabled: !!projectId,
  });
}

export function useRenameConversation(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      return api.aiControllerUpdateConversation({ id, project_id: projectId }, { title });
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

export function useToggleSharedConversation(
  projectId: string,
  onToggled?: (is_shared: boolean) => void,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_shared }: { id: string; is_shared: boolean }) => {
      return api.aiControllerUpdateConversation({ id, project_id: projectId }, { is_shared });
    },
    onMutate: async ({ id, is_shared }) => {
      await qc.cancelQueries({ queryKey: ['ai-conversations', projectId] });
      const previous = qc.getQueryData<AiConversation[]>(['ai-conversations', projectId]);
      qc.setQueryData<AiConversation[]>(['ai-conversations', projectId], (old) =>
        old ? old.map((c) => (c.id === id ? { ...c, is_shared } : c)) : old,
      );
      return { previous };
    },
    onSuccess: (_data, { is_shared }) => {
      onToggled?.(is_shared);
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(['ai-conversations', projectId], context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['ai-conversations', projectId] });
      qc.invalidateQueries({ queryKey: ['ai-conversations-shared', projectId] });
    },
  });
}

export function useSearchConversations(projectId: string, query: string) {
  return useQuery<AiConversationSearchResult[]>({
    queryKey: ['ai-conversations-search', projectId, query],
    queryFn: () => api.aiControllerSearchConversations({ project_id: projectId, q: query }),
    enabled: !!projectId && query.trim().length > 0,
    staleTime: 10_000,
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
      qc.invalidateQueries({ queryKey: ['ai-conversations-shared', projectId] });
    },
  });
}
