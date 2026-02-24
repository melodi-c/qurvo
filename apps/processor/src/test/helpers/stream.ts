import type Redis from 'ioredis';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { randomUUID } from 'crypto';
import { REDIS_STREAM_EVENTS } from '../../constants';
export { REDIS_STREAM_EVENTS };

export async function writeEventToStream(
  redis: Redis,
  projectId: string,
  overrides: Record<string, string> = {},
): Promise<string> {
  const fields: Record<string, string> = {
    event_id: randomUUID(),
    project_id: projectId,
    event_name: 'test_processor_event',
    event_type: 'track',
    distinct_id: `test-user-${randomUUID()}`,
    anonymous_id: '',
    user_id: '',
    session_id: '',
    url: '',
    referrer: '',
    page_title: '',
    page_path: '',
    device_type: '',
    browser: '',
    browser_version: '',
    os: '',
    os_version: '',
    screen_width: '0',
    screen_height: '0',
    language: '',
    timezone: '',
    ip: '',
    sdk_name: '',
    sdk_version: '',
    properties: '{}',
    user_properties: '{}',
    timestamp: new Date().toISOString(),
    ...overrides,
  };

  const flatArgs = Object.entries(fields).flat();
  const msgId = await redis.xadd(REDIS_STREAM_EVENTS, '*', ...flatArgs);
  return msgId as string;
}

export async function getEventCount(ch: ClickHouseClient, projectId: string): Promise<number> {
  const result = await ch.query({
    query: 'SELECT count() AS cnt FROM events FINAL WHERE project_id = {p:UUID}',
    query_params: { p: projectId },
    format: 'JSONEachRow',
  });
  const rows = await result.json<{ cnt: string }>();
  return Number(rows[0]?.cnt ?? 0);
}

/**
 * Polls ClickHouse until at least `minCount` events with the given batch_id appear.
 * Independent of other tests — only looks at our specific batch_id.
 */
export async function waitForEventByBatchId(
  ch: ClickHouseClient,
  projectId: string,
  batchId: string,
  opts: { minCount?: number; timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const { minCount = 1, timeoutMs = 10_000, intervalMs = 200 } = opts;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await ch.query({
      query: `SELECT count() AS cnt FROM events FINAL WHERE project_id = {p:UUID} AND batch_id = {b:String}`,
      query_params: { p: projectId, b: batchId },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ cnt: string }>();
    if (Number(rows[0].cnt) >= minCount) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(
    `waitForEventByBatchId timed out after ${timeoutMs}ms for batch_id=${batchId} (expected >=${minCount})`,
  );
}
