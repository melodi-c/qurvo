import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    globalSetup: ['./src/test/setup.ts'],
    setupFiles: ['./src/test/teardown.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 1,
      },
    },
    testTimeout: 30_000,
    hookTimeout: 120_000,
    reporters: ['verbose'],
  },
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: {
          decoratorMetadata: true,
          legacyDecorator: true,
        },
      },
    }),
  ],
});
