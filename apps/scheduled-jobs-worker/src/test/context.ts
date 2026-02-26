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
  // Remove AI runner env vars to ensure tests run without real API calls
  delete process.env.INTERNAL_API_URL;
  delete process.env.INTERNAL_API_TOKEN;

  const testProject = await createTestProject(ctx.db);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  return { ctx, app, testProject };
}

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
