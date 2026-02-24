import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    globalSetup: ['./src/test/setup.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 4,
      },
    },
    env: {
      // Prevent GeoService from attempting a network download that may hang
      GEOLITE2_COUNTRY_URL: 'http://127.0.0.1:1/noop',
      // Fast flush interval for tests (200ms instead of 5s)
      PROCESSOR_FLUSH_INTERVAL_MS: '200',
    },
    testTimeout: 30_000,
    hookTimeout: 120_000,
    teardownTimeout: 10_000,
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
