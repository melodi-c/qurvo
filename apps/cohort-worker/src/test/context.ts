import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import {
  setupContainers,
  teardownContainers,
  createTestProject,
  type ContainerContext,
  type TestProject,
} from '@qurvo/testing';
import { AppModule } from '../app.module';

interface TestContext {
  ctx: ContainerContext;
  app: INestApplicationContext;
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
  process.env.CLICKHOUSE_URL = ctx.clickhouseUrl;
  process.env.CLICKHOUSE_DB = ctx.clickhouseDb;
  process.env.CLICKHOUSE_USER = ctx.clickhouseUser;
  process.env.CLICKHOUSE_PASSWORD = ctx.clickhousePassword;

  const testProject = await createTestProject(ctx.db);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

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
  await app.close();
  await teardownContainers();
}
