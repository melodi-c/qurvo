import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '@/lib/auth-fetch';

export interface AiInsight {
  id: string;
  project_id: string;
  type: 'metric_change' | 'new_event' | 'retention_anomaly' | 'conversion_correlation';
  title: string;
  description: string;
  data_json: unknown;
  created_at: string;
  dismissed_at: string | null;
}

async function fetchInsights(projectId: string): Promise<AiInsight[]> {
  const res = await authFetch(`/api/projects/${projectId}/ai/insights`);
  if (!res.ok) throw new Error(`Failed to fetch insights: ${res.status}`);
  return res.json();
}

async function dismissInsight(projectId: string, insightId: string): Promise<void> {
  const res = await authFetch(`/api/projects/${projectId}/ai/insights/${insightId}/dismiss`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to dismiss insight: ${res.status}`);
}

export function useAiInsights(projectId: string) {
  return useQuery<AiInsight[]>({
    queryKey: ['ai-insights', projectId],
    queryFn: () => fetchInsights(projectId),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useDismissInsight(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (insightId: string) => dismissInsight(projectId, insightId),
    onMutate: async (insightId) => {
      await qc.cancelQueries({ queryKey: ['ai-insights', projectId] });
      const previous = qc.getQueryData<AiInsight[]>(['ai-insights', projectId]);
      qc.setQueryData<AiInsight[]>(['ai-insights', projectId], (old) =>
        old ? old.filter((i) => i.id !== insightId) : old,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(['ai-insights', projectId], context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['ai-insights', projectId] });
    },
  });
}
