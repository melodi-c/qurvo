import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  setupContainers,
  teardownContainers,
  createTestProject,
  type ContainerContext,
  type TestProject,
} from '@qurvo/testing';
import { AppModule } from '../app.module';
import { addGzipPreParsing } from '../hooks/gzip-preparsing';

interface TestContext {
  ctx: ContainerContext;
  app: INestApplication;
  testProject: TestProject;
}

let cached: Promise<TestContext> | null = null;

/**
 * Lazy singleton: boots containers + NestJS app + testProject once per test run.
 * Safe to call from every test file — only the first call does the actual work.
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

  const testProject = await createTestProject(ctx.db);

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ bodyLimit: 1048576 }),
  );

  addGzipPreParsing((app as NestFastifyApplication).getHttpAdapter().getInstance());

  await app.init();
  await app.listen(0);

  return { ctx, app, testProject };
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
