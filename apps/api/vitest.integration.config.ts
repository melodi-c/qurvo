import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [
    // Required for NestJS DI to work in integration tests that bootstrap the HTTP stack.
    // Emits decorator metadata so class-based injection (e.g. Reflector) resolves correctly.
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2022',
      },
    }),
  ],
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
