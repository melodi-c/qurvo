import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    globalSetup: ['./src/test/setup.ts'],
    setupFiles: ['./src/test/teardown.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 4,
      },
    },
    testTimeout: 60_000,
    hookTimeout: 120_000,
    teardownTimeout: 30_000,
    reporters: ['verbose'],
  },
});
