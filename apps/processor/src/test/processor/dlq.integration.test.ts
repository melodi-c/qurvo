import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import type { INestApplicationContext } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { ContainerContext, TestProject } from '@qurvo/testing';
import { getTestContext } from '../context';
import { flushBuffer, pushToDlq, getDlqLength } from '../helpers';
import { DlqService } from '../../processor/dlq.service';
import { BatchWriter } from '../../processor/batch-writer';
import { DLQ_CIRCUIT_BREAKER_THRESHOLD, DLQ_CIRCUIT_KEY, DLQ_FAILURES_KEY } from '../../constants';

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

afterEach(() => {
  vi.restoreAllMocks();
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
      query: `SELECT event_name FROM events WHERE project_id = {p:UUID} AND event_id = {e:UUID}`,
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

  it('circuit breaker blocks replay when open and allows after reset', async () => {
    const dlq = processorApp.get(DlqService);

    await ctx.redis.del('events:dlq', 'dlq:replay:lock', 'dlq:replay:circuit', 'dlq:replay:failures');

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

    expect(await getDlqLength(ctx.redis)).toBeGreaterThanOrEqual(1);

    // Open circuit breaker via Redis (as real DlqService does)
    await ctx.redis.set('dlq:replay:circuit', '1', 'PX', 300_000);

    await (dlq as any).replayDlq();
    // DLQ not drained — circuit open
    expect(await getDlqLength(ctx.redis)).toBeGreaterThanOrEqual(1);

    // Reset circuit (simulate TTL expiry)
    await ctx.redis.del('dlq:replay:circuit', 'dlq:replay:lock');

    await (dlq as any).replayDlq();
    // Now DLQ is drained
    expect(await getDlqLength(ctx.redis)).toBe(0);

    // After successful replay both keys are deleted (dlq.service.ts:94)
    expect(await ctx.redis.exists('dlq:replay:circuit')).toBe(0);
    expect(await ctx.redis.exists('dlq:replay:failures')).toBe(0);
  });

  it('5 consecutive replay failures open the circuit breaker automatically', { timeout: 60_000 }, async () => {
    const dlq = processorApp.get(DlqService);
    const batchWriter = processorApp.get(BatchWriter);

    // Clean state
    await ctx.redis.del(DLQ_CIRCUIT_KEY, DLQ_FAILURES_KEY, 'dlq:replay:lock', 'events:dlq');

    // Push a single DLQ entry so replay has something to process
    await pushToDlq(ctx.redis, {
      event_id: randomUUID(),
      project_id: testProject.projectId,
      event_name: 'cb_accumulation_test',
      event_type: 'track',
      distinct_id: `cb-acc-${randomUUID()}`,
      person_id: randomUUID(),
      timestamp: new Date().toISOString(),
      properties: '{}',
      user_properties: '{}',
      screen_width: 0,
      screen_height: 0,
    });

    // Make BatchWriter.write() always throw so every replay attempt fails
    vi.spyOn(batchWriter, 'write').mockRejectedValue(new Error('simulated CH failure'));

    // Invoke replayDlq() DLQ_CIRCUIT_BREAKER_THRESHOLD times (5 by default)
    for (let i = 0; i < DLQ_CIRCUIT_BREAKER_THRESHOLD; i++) {
      // Release the distributed lock between each call (it's deleted on every run)
      await ctx.redis.del('dlq:replay:lock');
      await (dlq as any).replayDlq();
    }

    // Circuit breaker must now be open
    const circuitOpen = await ctx.redis.exists(DLQ_CIRCUIT_KEY);
    expect(circuitOpen).toBe(1);

    // Failures counter must have been cleared when breaker opened
    const failures = await ctx.redis.exists(DLQ_FAILURES_KEY);
    expect(failures).toBe(0);

    // Additional replay attempts while circuit is open must be blocked (DLQ not drained)
    await ctx.redis.del('dlq:replay:lock');
    await (dlq as any).replayDlq();
    expect(await getDlqLength(ctx.redis)).toBeGreaterThanOrEqual(1);

    // Clean up
    await ctx.redis.del(DLQ_CIRCUIT_KEY, DLQ_FAILURES_KEY, 'events:dlq');
  });

  it('corrupted JSON in DLQ entry is skipped with a warn log and does not crash replay', async () => {
    const dlq = processorApp.get(DlqService);
    await ctx.redis.del('events:dlq', 'dlq:replay:lock');

    // Push a corrupted entry (invalid JSON) directly without using pushToDlq helper
    // (which JSON.stringify's the payload)
    await ctx.redis.xadd('events:dlq', '*', 'data', '{ this is not valid json }');

    // Also push a valid entry so we can verify only the valid one is replayed
    const validEventId = randomUUID();
    await pushToDlq(ctx.redis, {
      event_id: validEventId,
      project_id: testProject.projectId,
      event_name: 'dlq_valid_after_corrupt',
      event_type: 'track',
      distinct_id: `corrupt-test-${randomUUID()}`,
      person_id: randomUUID(),
      timestamp: new Date().toISOString(),
      properties: '{}',
      user_properties: '{}',
      screen_width: 0,
      screen_height: 0,
    });

    expect(await getDlqLength(ctx.redis)).toBe(2);

    const warnSpy = vi.spyOn((dlq as any).logger, 'warn');

    await (dlq as any).replayDlq();

    // DLQ fully drained (both entries deleted — corrupt one is skipped, valid one is replayed)
    expect(await getDlqLength(ctx.redis)).toBe(0);

    // Warn was emitted for the corrupted entry
    const warnCalls = warnSpy.mock.calls;
    const corruptWarn = warnCalls.find(
      (call) => typeof call[1] === 'string' && call[1].includes('invalid JSON'),
    );
    expect(corruptWarn).toBeDefined();
  });

  it('DLQ entry missing required fields is skipped with a warn log', async () => {
    const dlq = processorApp.get(DlqService);
    await ctx.redis.del('events:dlq', 'dlq:replay:lock');

    // Push an entry that is valid JSON but missing required fields
    await ctx.redis.xadd('events:dlq', '*', 'data', JSON.stringify({ event_id: randomUUID() }));

    const warnSpy = vi.spyOn((dlq as any).logger, 'warn');

    await (dlq as any).replayDlq();

    expect(await getDlqLength(ctx.redis)).toBe(0);

    const warnCalls = warnSpy.mock.calls;
    const missingFieldsWarn = warnCalls.find(
      (call) => typeof call[1] === 'string' && call[1].includes('missing required fields'),
    );
    expect(missingFieldsWarn).toBeDefined();
  });
});
