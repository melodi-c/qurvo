import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { authFetch } from '@/lib/auth-fetch';
import { useProjectId } from '@/hooks/use-project-id';

/**
 * Person record returned by persons-at endpoints.
 * Matches the BulkResolvePersonsResponse shape from #1039.
 */
export interface PersonAtRow {
  id: string;
  distinct_ids: string[];
  properties: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface PersonsAtResponse {
  persons: PersonAtRow[];
  total: number;
}

const PAGE_SIZE = 50;

// ----- Generic fetcher -----

async function fetchPersonsAt<T extends object>(
  projectId: string,
  endpoint: string,
  params: T,
  page: number,
): Promise<PersonsAtResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value !== undefined && value !== null) {
      query.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
  }
  query.set('limit', String(PAGE_SIZE));
  query.set('offset', String(page * PAGE_SIZE));

  const res = await authFetch(
    `/api/projects/${projectId}/${endpoint}?${query.toString()}`,
    { headers: { 'Content-Type': 'application/json' } },
  );

  if (!res.ok) {
    throw new Error(`persons-at request failed: ${res.status}`);
  }

  return res.json() as Promise<PersonsAtResponse>;
}

// ----- Per-insight hooks -----

export interface FunnelStepParams {
  insightId: string;
  stepIndex: number;
  dateFrom: string;
  dateTo: string;
  breakdown?: string;
  breakdownValue?: string;
}

export function usePersonsAtFunnelStep(
  params: FunnelStepParams | null,
  page: number,
) {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ['persons-at-funnel-step', projectId, params, page],
    queryFn: () =>
      fetchPersonsAt(projectId, 'insights/funnels/persons-at', params!, page),
    enabled: !!projectId && params !== null,
    placeholderData: keepPreviousData,
  });
}

export interface TrendBucketParams {
  insightId: string;
  seriesIndex: number;
  bucket: string;
  dateFrom: string;
  dateTo: string;
  breakdown?: string;
  breakdownValue?: string;
}

export function usePersonsAtTrendBucket(
  params: TrendBucketParams | null,
  page: number,
) {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ['persons-at-trend-bucket', projectId, params, page],
    queryFn: () =>
      fetchPersonsAt(projectId, 'insights/trends/persons-at', params!, page),
    enabled: !!projectId && params !== null,
    placeholderData: keepPreviousData,
  });
}

export interface LifecycleBucketParams {
  insightId: string;
  bucket: string;
  status: string;
  dateFrom: string;
  dateTo: string;
}

export function usePersonsAtLifecycleBucket(
  params: LifecycleBucketParams | null,
  page: number,
) {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ['persons-at-lifecycle-bucket', projectId, params, page],
    queryFn: () =>
      fetchPersonsAt(projectId, 'insights/lifecycles/persons-at', params!, page),
    enabled: !!projectId && params !== null,
    placeholderData: keepPreviousData,
  });
}

export interface RetentionCellParams {
  insightId: string;
  cohortDate: string;
  period: number;
  dateFrom: string;
  dateTo: string;
}

export function usePersonsAtRetentionCell(
  params: RetentionCellParams | null,
  page: number,
) {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ['persons-at-retention-cell', projectId, params, page],
    queryFn: () =>
      fetchPersonsAt(projectId, 'insights/retentions/persons-at', params!, page),
    enabled: !!projectId && params !== null,
    placeholderData: keepPreviousData,
  });
}

export interface StickinessBarParams {
  insightId: string;
  dayCount: number;
  dateFrom: string;
  dateTo: string;
}

export function usePersonsAtStickinessBar(
  params: StickinessBarParams | null,
  page: number,
) {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ['persons-at-stickiness-bar', projectId, params, page],
    queryFn: () =>
      fetchPersonsAt(projectId, 'insights/stickiness/persons-at', params!, page),
    enabled: !!projectId && params !== null,
    placeholderData: keepPreviousData,
  });
}

export { PAGE_SIZE };
