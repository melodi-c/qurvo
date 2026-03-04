import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useProjectId } from '@/hooks/use-project-id';
import type {
  PersonsControllerGetPersonsAtFunnelStepParams,
  PersonsControllerGetPersonsAtTrendBucketParams,
  PersonsControllerGetPersonsAtLifecycleBucketParams,
  PersonsControllerGetPersonsAtRetentionCellParams,
  PersonsControllerGetPersonsAtStickinessBarParams,
} from '@/api/generated/Api';

const PAGE_SIZE = 50;

// Param types omit project_id, limit, offset — injected by hook
export type FunnelStepParams = Omit<
  PersonsControllerGetPersonsAtFunnelStepParams,
  'project_id' | 'limit' | 'offset'
>;
export type TrendBucketParams = Omit<
  PersonsControllerGetPersonsAtTrendBucketParams,
  'project_id' | 'limit' | 'offset'
>;
export type LifecycleBucketParams = Omit<
  PersonsControllerGetPersonsAtLifecycleBucketParams,
  'project_id' | 'limit' | 'offset'
>;
export type RetentionCellParams = Omit<
  PersonsControllerGetPersonsAtRetentionCellParams,
  'project_id' | 'limit' | 'offset'
>;
export type StickinessBarParams = Omit<
  PersonsControllerGetPersonsAtStickinessBarParams,
  'project_id' | 'limit' | 'offset'
>;

export function usePersonsAtFunnelStep(
  params: FunnelStepParams | null,
  page: number,
) {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ['persons-at-funnel-step', projectId, params, page],
    queryFn: async () => {
      const res = await api.personsControllerGetPersonsAtFunnelStep({
        ...params!,
        project_id: projectId,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      return res;
    },
    enabled: !!projectId && params !== null,
    placeholderData: keepPreviousData,
  });
}

export function usePersonsAtTrendBucket(
  params: TrendBucketParams | null,
  page: number,
) {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ['persons-at-trend-bucket', projectId, params, page],
    queryFn: async () => {
      const res = await api.personsControllerGetPersonsAtTrendBucket({
        ...params!,
        project_id: projectId,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      return res;
    },
    enabled: !!projectId && params !== null,
    placeholderData: keepPreviousData,
  });
}

export function usePersonsAtLifecycleBucket(
  params: LifecycleBucketParams | null,
  page: number,
) {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ['persons-at-lifecycle-bucket', projectId, params, page],
    queryFn: async () => {
      const res = await api.personsControllerGetPersonsAtLifecycleBucket({
        ...params!,
        project_id: projectId,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      return res;
    },
    enabled: !!projectId && params !== null,
    placeholderData: keepPreviousData,
  });
}

export function usePersonsAtRetentionCell(
  params: RetentionCellParams | null,
  page: number,
) {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ['persons-at-retention-cell', projectId, params, page],
    queryFn: async () => {
      const res = await api.personsControllerGetPersonsAtRetentionCell({
        ...params!,
        project_id: projectId,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      return res;
    },
    enabled: !!projectId && params !== null,
    placeholderData: keepPreviousData,
  });
}

export function usePersonsAtStickinessBar(
  params: StickinessBarParams | null,
  page: number,
) {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ['persons-at-stickiness-bar', projectId, params, page],
    queryFn: async () => {
      const res = await api.personsControllerGetPersonsAtStickinessBar({
        ...params!,
        project_id: projectId,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      return res;
    },
    enabled: !!projectId && params !== null,
    placeholderData: keepPreviousData,
  });
}

export { PAGE_SIZE };
