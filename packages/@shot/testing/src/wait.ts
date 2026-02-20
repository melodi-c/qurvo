import type { ClickHouseClient } from '@shot/clickhouse';
import type Redis from 'ioredis';

export interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
}

export async function waitForClickHouseCount(
  ch: ClickHouseClient,
  projectId: string,
  expectedCount: number,
  opts: WaitOptions = {},
): Promise<void> {
  const { timeoutMs = 15_000, intervalMs = 250 } = opts;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await ch.query({
      query: 'SELECT count() AS cnt FROM events FINAL WHERE project_id = {project_id:UUID}',
      query_params: { project_id: projectId },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ cnt: string }>();
    if (Number(rows[0]?.cnt ?? 0) >= expectedCount) return;
    await sleep(intervalMs);
  }

  throw new Error(
    `waitForClickHouseCount timed out after ${timeoutMs}ms waiting for ${expectedCount} events (project_id=${projectId})`,
  );
}

export async function waitForRedisStreamLength(
  redis: Redis,
  streamKey: string,
  minLength: number,
  opts: WaitOptions = {},
): Promise<void> {
  const { timeoutMs = 10_000, intervalMs = 100 } = opts;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const len = await redis.xlen(streamKey);
    if (len >= minLength) return;
    await sleep(intervalMs);
  }

  throw new Error(
    `waitForRedisStreamLength timed out after ${timeoutMs}ms waiting for ${minLength} entries in ${streamKey}`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
