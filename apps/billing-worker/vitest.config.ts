throw new Error(
  "

❌  No default vitest config — specify one explicitly:
" +
  "    vitest run --config vitest.integration.config.ts
" +
  "    vitest run --config vitest.unit.config.ts  (api only)

" +
  "Or via npm script:
" +
  "    pnpm --filter @qurvo/<app> test:integration
"
);

