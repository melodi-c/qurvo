import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    testTimeout: 90_000,
    hookTimeout: 120_000,
    reporters: ['verbose'],
  },
  plugins: [
    swc.vite({
      module: { type: 'commonjs' },
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
