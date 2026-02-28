import 'reflect-metadata';
import { Test, type TestingModule } from '@nestjs/testing';
import type Redis from 'ioredis';
import type { Database } from '@qurvo/db';
import { REDIS, DRIZZLE } from '@qurvo/nestjs-infra';
import {
  setupContainers,
  teardownContainers,
  type ContainerContext,
} from '@qurvo/testing';
import { AppModule } from '../app.module';
import { BillingCheckService } from '../billing/billing-check.service';

interface TestContext {
  ctx: ContainerContext;
  moduleRef: TestingModule;
  billingService: BillingCheckService;
}

let cached: Promise<TestContext> | null = null;

/**
 * Lazy singleton: boots containers + NestJS module once per test run.
 * Safe to call from every test file — only the first call does the actual work.
 *
 * We intentionally avoid createNestApplication() + app.close() here because
 * NestJS does not guarantee that OnApplicationShutdown hooks fire when
 * app.close() is called without a preceding app.init(). Instead we compile
 * the module, grab services directly, and close connections explicitly in
 * closeTestContext(). This also prevents the PeriodicWorkerMixin timers
 * (BillingCheckService, AiQuotaResetService) from starting automatically.
 */
export function getTestContext(): Promise<TestContext> {
  if (cached) {return cached;}
  cached = bootstrap();
  return cached;
}

async function bootstrap(): Promise<TestContext> {
  const ctx = await setupContainers();

  process.env.DATABASE_URL = ctx.pgUrl;
  process.env.REDIS_URL = ctx.redisUrl;

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const billingService = moduleRef.get(BillingCheckService);

  return { ctx, moduleRef, billingService };
}

/**
 * Closes open connections and tears down containers.
 * We close Redis and the PG pool directly via moduleRef.get() because
 * OnApplicationShutdown hooks are not invoked without app.init().
 * Called once at the very end (setupFiles afterAll teardown).
 */
export async function closeTestContext(): Promise<void> {
  if (!cached) {return;}
  const { moduleRef } = await cached;
  cached = null;
  try {
    const redis = moduleRef.get<Redis>(REDIS);
    const db = moduleRef.get<Database>(DRIZZLE);
    await redis.quit().catch(() => undefined);
    await db.$pool.end().catch(() => undefined);
    await moduleRef.close();
  } finally {
    await teardownContainers();
  }
}
