import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import {
  setupContainers,
  teardownContainers,
  type ContainerContext,
} from '@qurvo/testing';
import { AppModule } from '../app.module';
import { BillingCheckService } from '../billing/billing-check.service';

interface TestContext {
  ctx: ContainerContext;
  app: INestApplication;
  billingService: BillingCheckService;
}

let cached: Promise<TestContext> | null = null;

/**
 * Lazy singleton: boots containers + NestJS module once per test run.
 * Safe to call from every test file — only the first call does the actual work.
 * Note: app.init() is intentionally NOT called — we don't want the scheduled
 * cycle to start. Tests invoke billingService.runCycle() manually.
 */
export function getTestContext(): Promise<TestContext> {
  if (cached) return cached;
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

  const app = moduleRef.createNestApplication();
  // Don't call app.init() — we don't want the scheduled cycle to start.
  // Instead, get the service and call runCycle() manually.
  const billingService = moduleRef.get(BillingCheckService);

  return { ctx, app, billingService };
}

/**
 * Shuts down the shared NestJS app and closes all test connections.
 * Called once at the very end (setupFiles afterAll teardown).
 */
export async function closeTestContext(): Promise<void> {
  if (!cached) return;
  const { app } = await cached;
  cached = null;
  try {
    await app.close();
  } finally {
    await teardownContainers();
  }
}
