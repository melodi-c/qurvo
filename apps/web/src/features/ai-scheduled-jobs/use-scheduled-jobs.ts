import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { AiScheduledJob, CreateScheduledJob, UpdateScheduledJob } from '@/api/generated/Api';

export type { AiScheduledJob };

export function useScheduledJobs(projectId: string) {
  return useQuery<AiScheduledJob[]>({
    queryKey: ['ai-scheduled-jobs', projectId],
    queryFn: () => api.aiScheduledJobsControllerList({ projectId }),
    enabled: !!projectId,
  });
}

export function useCreateScheduledJob(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateScheduledJob) =>
      api.aiScheduledJobsControllerCreate({ projectId }, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai-scheduled-jobs', projectId] });
    },
  });
}

export function useUpdateScheduledJob(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, data }: { jobId: string; data: UpdateScheduledJob }) =>
      api.aiScheduledJobsControllerUpdate({ projectId, jobId }, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai-scheduled-jobs', projectId] });
    },
  });
}

export function useDeleteScheduledJob(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) =>
      api.aiScheduledJobsControllerRemove({ projectId, jobId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai-scheduled-jobs', projectId] });
    },
  });
}
