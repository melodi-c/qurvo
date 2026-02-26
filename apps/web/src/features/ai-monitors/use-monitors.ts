import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { AiMonitor, CreateMonitor, UpdateMonitor } from '@/api/generated/Api';

export type { AiMonitor };

export function useMonitors(projectId: string) {
  return useQuery<AiMonitor[]>({
    queryKey: ['ai-monitors', projectId],
    queryFn: () => api.aiMonitorsControllerList({ projectId }),
    enabled: !!projectId,
  });
}

export function useCreateMonitor(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateMonitor) =>
      api.aiMonitorsControllerCreate({ projectId }, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai-monitors', projectId] });
    },
  });
}

export function useUpdateMonitor(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ monitorId, data }: { monitorId: string; data: UpdateMonitor }) =>
      api.aiMonitorsControllerUpdate({ projectId, monitorId }, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai-monitors', projectId] });
    },
  });
}

export function useDeleteMonitor(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (monitorId: string) =>
      api.aiMonitorsControllerRemove({ projectId, monitorId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai-monitors', projectId] });
    },
  });
}
