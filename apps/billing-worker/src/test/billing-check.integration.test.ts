import 'reflect-metadata';
import { randomUUID, randomBytes } from 'crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { setupContainers, createTestProject, type ContainerContext } from '@qurvo/testing';
import { projects, plans } from '@qurvo/db';
import { AppModule } from '../app.module';
import { BillingCheckService } from '../billing/billing-check.service';
import { BILLING_QUOTA_LIMITED_KEY, billingCounterKey } from '../constants';

let ctx: ContainerContext;
let app: INestApplication;
let billingService: BillingCheckService;

beforeAll(async () => {
  ctx = await setupContainers();

  process.env.DATABASE_URL = ctx.pgUrl;
  process.env.REDIS_URL = ctx.redisUrl;

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleRef.createNestApplication();
  // Don't call app.init() — we don't want the scheduled cycle to start.
  // Instead, get the service and call runCycle() manually.
  billingService = moduleRef.get(BillingCheckService);
}, 120_000);

afterAll(async () => {
  await app?.close();
});

beforeEach(async () => {
  // Clear the quota_limited set before each test
  await ctx.redis.del(BILLING_QUOTA_LIMITED_KEY);
});

async function createPlanWithLimit(limit: number): Promise<string> {
  const planId = randomUUID();
  await ctx.db.insert(plans).values({
    id: planId,
    slug: `billing-test-${randomBytes(4).toString('hex')}`,
    name: 'Test Plan',
    events_limit: limit,
    features: { cohorts: false, lifecycle: false, stickiness: false, api_export: false, ai_insights: false },
  } as any);
  return planId;
}

async function assignPlan(projectId: string, planId: string): Promise<void> {
  await ctx.db.update(projects).set({ plan_id: planId } as any).where(eq(projects.id, projectId));
}

describe('BillingCheckService', () => {
  it('adds over-limit project to quota_limited set', async () => {
    const planId = await createPlanWithLimit(100);
    const tp = await createTestProject(ctx.db);
    await assignPlan(tp.projectId, planId);

    // Set billing counter above limit
    await ctx.redis.set(billingCounterKey(tp.projectId), '150');

    await billingService.runCycle();

    const isMember = await ctx.redis.sismember(BILLING_QUOTA_LIMITED_KEY, tp.projectId);
    expect(isMember).toBe(1);
  });

  it('does not add under-limit project to quota_limited set', async () => {
    const planId = await createPlanWithLimit(1000);
    const tp = await createTestProject(ctx.db);
    await assignPlan(tp.projectId, planId);

    // Set billing counter below limit
    await ctx.redis.set(billingCounterKey(tp.projectId), '50');

    await billingService.runCycle();

    const isMember = await ctx.redis.sismember(BILLING_QUOTA_LIMITED_KEY, tp.projectId);
    expect(isMember).toBe(0);
  });

  it('removes project from set when counter drops below limit', async () => {
    const planId = await createPlanWithLimit(100);
    const tp = await createTestProject(ctx.db);
    await assignPlan(tp.projectId, planId);

    // Initially over limit
    await ctx.redis.set(billingCounterKey(tp.projectId), '200');
    await billingService.runCycle();
    expect(await ctx.redis.sismember(BILLING_QUOTA_LIMITED_KEY, tp.projectId)).toBe(1);

    // Counter resets (new month or manual reset)
    await ctx.redis.set(billingCounterKey(tp.projectId), '10');
    await billingService.runCycle();
    expect(await ctx.redis.sismember(BILLING_QUOTA_LIMITED_KEY, tp.projectId)).toBe(0);
  });

  it('removes stale entries from set on cycle', async () => {
    // Pre-seed the set with a fake project ID that doesn't exist in DB
    const staleId = randomUUID();
    await ctx.redis.sadd(BILLING_QUOTA_LIMITED_KEY, staleId);

    await billingService.runCycle();

    // Stale entry should be gone (DEL + SADD replaces the entire set)
    const isMember = await ctx.redis.sismember(BILLING_QUOTA_LIMITED_KEY, staleId);
    expect(isMember).toBe(0);
  });

  it('handles multiple projects — only over-limit ones are in the set', async () => {
    const planId = await createPlanWithLimit(100);

    const over = await createTestProject(ctx.db);
    await assignPlan(over.projectId, planId);
    await ctx.redis.set(billingCounterKey(over.projectId), '500');

    const under = await createTestProject(ctx.db);
    await assignPlan(under.projectId, planId);
    await ctx.redis.set(billingCounterKey(under.projectId), '10');

    const exact = await createTestProject(ctx.db);
    await assignPlan(exact.projectId, planId);
    await ctx.redis.set(billingCounterKey(exact.projectId), '100'); // exactly at limit

    await billingService.runCycle();

    expect(await ctx.redis.sismember(BILLING_QUOTA_LIMITED_KEY, over.projectId)).toBe(1);
    expect(await ctx.redis.sismember(BILLING_QUOTA_LIMITED_KEY, under.projectId)).toBe(0);
    expect(await ctx.redis.sismember(BILLING_QUOTA_LIMITED_KEY, exact.projectId)).toBe(1); // >= limit
  });

  it('sets TTL on the quota_limited key', async () => {
    const planId = await createPlanWithLimit(100);
    const tp = await createTestProject(ctx.db);
    await assignPlan(tp.projectId, planId);
    await ctx.redis.set(billingCounterKey(tp.projectId), '200');

    await billingService.runCycle();

    const ttl = await ctx.redis.ttl(BILLING_QUOTA_LIMITED_KEY);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(120);
  });

  it('skips projects without a counter (treats as 0 events)', async () => {
    const planId = await createPlanWithLimit(100);
    const tp = await createTestProject(ctx.db);
    await assignPlan(tp.projectId, planId);

    // No counter set — should be treated as 0 events (under limit)
    await billingService.runCycle();

    const isMember = await ctx.redis.sismember(BILLING_QUOTA_LIMITED_KEY, tp.projectId);
    expect(isMember).toBe(0);
  });
});
