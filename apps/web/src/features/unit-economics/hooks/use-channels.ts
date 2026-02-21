import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { CreateMarketingChannel, UpdateMarketingChannel } from '@/api/generated/Api';

function useProjectId() {
  const [searchParams] = useSearchParams();
  return searchParams.get('project') || '';
}

export function useChannels() {
  const projectId = useProjectId();
  return useQuery({
    queryKey: ['channels', projectId],
    queryFn: () => api.marketingChannelsControllerList({ projectId }),
    enabled: !!projectId,
  });
}

export function useCreateChannel() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateMarketingChannel) =>
      api.marketingChannelsControllerCreate({ projectId }, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels', projectId] });
    },
  });
}

export function useUpdateChannel() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ channelId, data }: { channelId: string; data: UpdateMarketingChannel }) =>
      api.marketingChannelsControllerUpdate({ projectId, channelId }, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels', projectId] });
    },
  });
}

export function useDeleteChannel() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) =>
      api.marketingChannelsControllerRemove({ projectId, channelId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels', projectId] });
      qc.invalidateQueries({ queryKey: ['adSpend', projectId] });
    },
  });
}
