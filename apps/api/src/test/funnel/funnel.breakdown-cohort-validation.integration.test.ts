import { describe, it, expect, beforeAll, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { getTestContext, type ContainerContext } from '../context';
import { createAnalyticsQueryProvider } from '../../analytics/analytics-query.factory';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';
import type Redis from 'ioredis';

/**
 * Integration tests for the analytics-query.factory guard:
 * breakdown_cohort_ids without breakdown_type='cohort' must throw AppBadRequestException.
 *
 * These tests instantiate the factory directly with test-container infrastructure
 * (real ClickHouse client) and a stubbed CohortsService + Redis.
 */

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

// Minimal CohortsService stub — not called in the error path
function makeCohortsServiceStub() {
  return {
    resolveCohortFilters: vi.fn().mockResolvedValue([]),
    resolveCohortBreakdowns: vi.fn().mockResolvedValue([]),
  };
}

// Minimal Redis stub — not called in the error path
function makeRedisStub() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  } as unknown as Redis;
}

// Instantiate the analytics query service from the factory, using test infrastructure
function buildService(queryFn: (...args: unknown[]) => unknown = vi.fn().mockResolvedValue({})) {
  const provider = createAnalyticsQueryProvider(
    Symbol('test'),
    'test',
    queryFn as never,
  ) as { useFactory: (...args: unknown[]) => unknown };

  const cohortsService = makeCohortsServiceStub();

  const service = provider.useFactory(
    ctx.ch,
    makeRedisStub(),
    cohortsService,
  ) as {
    query: (params: Record<string, unknown>) => Promise<unknown>;
  };

  return { service, cohortsService };
}

const baseParams = {
  project_id: randomUUID(),
  date_from: '2024-01-01',
  date_to: '2024-01-31',
};

describe('analytics-query.factory — breakdown_cohort_ids guard', () => {
  it('throws AppBadRequestException when breakdown_cohort_ids provided without breakdown_type', async () => {
    const { service } = buildService();

    await expect(
      service.query({
        ...baseParams,
        breakdown_cohort_ids: [randomUUID()],
        // breakdown_type intentionally omitted
      }),
    ).rejects.toThrow(AppBadRequestException);
  });

  it("throws AppBadRequestException when breakdown_cohort_ids provided with breakdown_type='property'", async () => {
    const { service } = buildService();

    await expect(
      service.query({
        ...baseParams,
        breakdown_cohort_ids: [randomUUID()],
        breakdown_type: 'property',
      }),
    ).rejects.toThrow(AppBadRequestException);
  });

  it("error message mentions breakdown_type and 'cohort'", async () => {
    const { service } = buildService();

    await expect(
      service.query({
        ...baseParams,
        breakdown_cohort_ids: [randomUUID()],
      }),
    ).rejects.toThrow(/breakdown_type/);
  });

  it('does NOT throw when breakdown_cohort_ids is absent (no breakdown_type required)', async () => {
    const queryFn = vi.fn().mockResolvedValue({ breakdown: false, steps: [] });
    const { service } = buildService(queryFn as never);

    await expect(
      service.query({
        ...baseParams,
        // no breakdown_cohort_ids
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT throw when breakdown_cohort_ids is an empty array (guard skips empty array)', async () => {
    const queryFn = vi.fn().mockResolvedValue({ breakdown: false, steps: [] });
    const { service } = buildService(queryFn as never);

    await expect(
      service.query({
        ...baseParams,
        breakdown_cohort_ids: [],
        // no breakdown_type
      }),
    ).resolves.toBeDefined();
  });

  it("does NOT throw when breakdown_cohort_ids provided with breakdown_type='cohort' (valid combination)", async () => {
    const queryFn = vi.fn().mockResolvedValue({ breakdown: true, steps: [] });
    const { service } = buildService(queryFn as never);

    await expect(
      service.query({
        ...baseParams,
        breakdown_cohort_ids: [randomUUID()],
        breakdown_type: 'cohort',
      }),
    ).resolves.toBeDefined();
  });
});
