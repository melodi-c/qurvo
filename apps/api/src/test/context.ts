import { setupContainers, teardownContainers, type ContainerContext } from '@qurvo/testing';

let cached: Promise<ContainerContext> | null = null;

/**
 * Lazy singleton: returns shared test containers (PG, Redis, ClickHouse).
 * Safe to call from every test file — only the first call does the actual work.
 */
export function getTestContext(): Promise<ContainerContext> {
  if (cached) return cached;
  cached = setupContainers();
  return cached;
}

/**
 * Closes all test container connections.
 * Called once at the very end (setupFiles afterAll teardown).
 */
export async function closeTestContext(): Promise<void> {
  if (!cached) return;
  cached = null;
  try {
    await teardownContainers();
  } finally {
    // no additional cleanup needed for API (no NestJS app to close)
  }
}
