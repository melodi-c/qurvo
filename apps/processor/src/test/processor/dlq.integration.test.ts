import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { INestApplicationContext } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { ContainerContext, TestProject } from '@qurvo/testing';
import { getTestContext } from '../context';
import { flushBuffer, pushToDlq, getDlqLength } from '../helpers';
import { DlqService } from '../../processor/dlq.service';

let ctx: ContainerContext;
let processorApp: INestApplicationContext;
let testProject: TestProject;

beforeAll(async () => {
  const tc = await getTestContext();
  ctx = tc.ctx;
  processorApp = tc.app;
  testProject = tc.testProject;
}, 120_000);

beforeEach(async () => {
  await flushBuffer(processorApp);
});

describe('dead letter queue', () => {
  it('replay from DLQ — event ends up in ClickHouse', async () => {
    const projectId = testProject.projectId;
    const distinctId = `dlq-replay-${randomUUID()}`;
    const eventId = randomUUID();

    await ctx.redis.del('events:dlq');

    await pushToDlq(ctx.redis, {
      event_id: eventId,
      project_id: projectId,
      event_name: 'dlq_test_event',
      event_type: 'track',
      distinct_id: distinctId,
      person_id: randomUUID(),
      timestamp: new Date().toISOString(),
      properties: '{}',
      user_properties: '{}',
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
      screen_width: 0,
      screen_height: 0,
      country: '',
      region: '',
      city: '',
      language: '',
      timezone: '',
      sdk_name: '',
      sdk_version: '',
      batch_id: '',
      ip: '',
    });

    expect(await getDlqLength(ctx.redis)).toBeGreaterThanOrEqual(1);

    await ctx.redis.del('dlq:replay:lock');

    const dlq = processorApp.get(DlqService);
    await (dlq as any).replayDlq();

    expect(await getDlqLength(ctx.redis)).toBe(0);

    const result = await ctx.ch.query({
      query: `SELECT event_name FROM events FINAL WHERE project_id = {p:UUID} AND event_id = {e:UUID}`,
      query_params: { p: projectId, e: eventId },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ event_name: string }>();
    expect(rows).toHaveLength(1);
    expect(rows[0].event_name).toBe('dlq_test_event');
  });

  it('distributed lock blocks replay', async () => {
    await pushToDlq(ctx.redis, {
      event_id: randomUUID(),
      project_id: testProject.projectId,
      event_name: 'locked_event',
      event_type: 'track',
      distinct_id: `locked-${randomUUID()}`,
      person_id: randomUUID(),
      timestamp: new Date().toISOString(),
      properties: '{}',
      user_properties: '{}',
      screen_width: 0,
      screen_height: 0,
    });

    const lengthBefore = await getDlqLength(ctx.redis);

    await ctx.redis.set('dlq:replay:lock', 'another-instance', 'EX', 60, 'NX');

    const dlq = processorApp.get(DlqService);
    await (dlq as any).replayDlq();

    const lengthAfter = await getDlqLength(ctx.redis);
    expect(lengthAfter).toBe(lengthBefore);

    await ctx.redis.del('dlq:replay:lock');
  });

  it('circuit breaker opens after threshold failures and resets', async () => {
    const dlq = processorApp.get(DlqService);

    (dlq as any).consecutiveFailures = 0;
    (dlq as any).circuitOpenedAt = null;

    (dlq as any).consecutiveFailures = 5;
    (dlq as any).circuitOpenedAt = Date.now();

    await ctx.redis.del('dlq:replay:lock');

    await ctx.redis.del('events:dlq');
    await pushToDlq(ctx.redis, {
      event_id: randomUUID(),
      project_id: testProject.projectId,
      event_name: 'circuit_test',
      event_type: 'track',
      distinct_id: `cb-${randomUUID()}`,
      person_id: randomUUID(),
      timestamp: new Date().toISOString(),
      properties: '{}',
      user_properties: '{}',
      screen_width: 0,
      screen_height: 0,
    });

    await (dlq as any).replayDlq();
    expect(await getDlqLength(ctx.redis)).toBeGreaterThanOrEqual(1);

    (dlq as any).circuitOpenedAt = Date.now() - 6 * 60_000;

    await ctx.redis.del('dlq:replay:lock');
    await (dlq as any).replayDlq();

    expect(await getDlqLength(ctx.redis)).toBe(0);

    expect((dlq as any).consecutiveFailures).toBe(0);
    expect((dlq as any).circuitOpenedAt).toBeNull();
  });
});
