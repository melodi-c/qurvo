import type { ClickHouseClient } from '@qurvo/clickhouse';
import type Redis from 'ioredis';

export async function getOverrides(
  ch: ClickHouseClient,
  projectId: string,
  distinctId: string,
): Promise<Array<{ person_id: string; version: string }>> {
  const result = await ch.query({
    query: `SELECT person_id, version
            FROM person_distinct_id_overrides FINAL
            WHERE project_id = {p:UUID} AND distinct_id = {d:String}`,
    query_params: { p: projectId, d: distinctId },
    format: 'JSONEachRow',
  });
  return result.json<{ person_id: string; version: string }>();
}

export async function getCohortMembers(
  ch: ClickHouseClient,
  projectId: string,
  cohortId: string,
): Promise<string[]> {
  const result = await ch.query({
    query: `SELECT DISTINCT person_id
            FROM cohort_members FINAL
            WHERE project_id = {p:UUID} AND cohort_id = {c:UUID} AND version > 0`,
    query_params: { p: projectId, c: cohortId },
    format: 'JSONEachRow',
  });
  const rows = await result.json<{ person_id: string }>();
  return rows.map((r) => r.person_id);
}

export async function getDlqLength(redis: Redis): Promise<number> {
  return redis.xlen('events:dlq');
}

export async function pushToDlq(redis: Redis, event: Record<string, unknown>): Promise<void> {
  await redis.xadd('events:dlq', '*', 'data', JSON.stringify(event));
}
