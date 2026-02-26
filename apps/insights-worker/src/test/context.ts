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

export function getTestContext(): Promise<TestContext> {
  if (cached) return cached;
  cached = bootstrap();
  return cached;
}

async function bootstrap(): Promise<TestContext> {
  const ctx = await setupContainers();

  process.env.DATABASE_URL = ctx.pgUrl;
  process.env.CLICKHOUSE_URL = ctx.clickhouseUrl;
  process.env.CLICKHOUSE_DB = ctx.clickhouseDb;
  process.env.CLICKHOUSE_USER = ctx.clickhouseUser;
  process.env.CLICKHOUSE_PASSWORD = ctx.clickhousePassword;

  const testProject = await createTestProject(ctx.db);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  return { ctx, app, testProject };
}

export async function closeTestContext(): Promise<void> {
  if (!cached) return;
  const { app } = await cached;
  cached = null;
  await app.close();
  await teardownContainers();
}
