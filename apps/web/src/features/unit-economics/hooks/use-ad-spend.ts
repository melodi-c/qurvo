import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { CreateAdSpend, UpdateAdSpend, BulkCreateAdSpend } from '@/api/generated/Api';

function useProjectId() {
  const [searchParams] = useSearchParams();
  return searchParams.get('project') || '';
}

export function useAdSpend(filters?: { channel_id?: string; date_from?: string; date_to?: string }) {
  const projectId = useProjectId();
  return useQuery({
    queryKey: ['adSpend', projectId, filters],
    queryFn: () => api.adSpendControllerList({ projectId, ...filters }),
    enabled: !!projectId,
  });
}

export function useAdSpendSummary(filters?: { date_from?: string; date_to?: string }) {
  const projectId = useProjectId();
  return useQuery({
    queryKey: ['adSpendSummary', projectId, filters],
    queryFn: () => api.adSpendControllerSummary({ projectId, ...filters }),
    enabled: !!projectId,
  });
}

export function useCreateAdSpend() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAdSpend) =>
      api.adSpendControllerCreate({ projectId }, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adSpend', projectId] });
      qc.invalidateQueries({ queryKey: ['adSpendSummary', projectId] });
    },
  });
}

export function useBulkCreateAdSpend() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BulkCreateAdSpend) =>
      api.adSpendControllerBulkCreate({ projectId }, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adSpend', projectId] });
      qc.invalidateQueries({ queryKey: ['adSpendSummary', projectId] });
    },
  });
}

export function useUpdateAdSpend() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAdSpend }) =>
      api.adSpendControllerUpdate({ projectId, id }, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adSpend', projectId] });
      qc.invalidateQueries({ queryKey: ['adSpendSummary', projectId] });
    },
  });
}

export function useDeleteAdSpend() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.adSpendControllerRemove({ projectId, id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adSpend', projectId] });
      qc.invalidateQueries({ queryKey: ['adSpendSummary', projectId] });
    },
  });
}
