import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/test/utils/**/*.test.ts'],
    environment: 'node',
    alias: {
      // clickhouse-helpers.ts re-exports from @qurvo/cohort-query but the
      // functions under test (granularityTruncExpr, shiftPeriod, etc.) do not
      // use it.  Stub it so unit tests can run without building the package.
      '@qurvo/cohort-query': new URL(
        './src/test/utils/__mocks__/cohort-query.ts',
        import.meta.url,
      ).pathname,
    },
  },
});
