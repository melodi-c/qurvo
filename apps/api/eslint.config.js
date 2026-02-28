const { base, typeAware } = require('@qurvo/eslint-config');

module.exports = [
  ...base,
  ...typeAware('./tsconfig.json'),
  // Analytics query builders — inherently complex SQL construction.
  {
    files: [
      '**/analytics/**/*.ts',
      '**/web-analytics/**/*.ts',
      '**/utils/property-filter.ts',
      '**/utils/pg-property-filter.ts',
      '**/utils/clickhouse-helpers.ts',
    ],
    rules: {
      complexity: ['error', 30],
      'max-depth': ['error', 10],
      'max-params': ['error', 12],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  // NestJS controllers/services/modules — DI requires many constructor params,
  // controllers use `as any` for Swagger DTO bridging,
  // services contain business logic with inherent complexity
  {
    files: ['**/*.controller.ts', '**/*.service.ts', '**/*.module.ts'],
    rules: {
      'max-params': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      complexity: ['error', 20],
      'max-depth': ['error', 6],
    },
  },
  // Guards — auth logic with multiple validation paths
  {
    files: ['**/*.guard.ts'],
    rules: {
      complexity: ['error', 15],
    },
  },
  // Tool definitions and AI agent — dynamic types and complex orchestration
  {
    files: ['**/tools/**/*.ts', '**/ai-agent/**/*.ts'],
    rules: {
      complexity: ['error', 60],
      'max-params': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  // AI module — stateful conversation history and dispatcher logic
  {
    files: ['**/ai/*.ts'],
    rules: {
      complexity: ['error', 15],
    },
  },
  // Demo scenarios — large data generation functions, deeply nested loops
  {
    files: ['**/demo/**/*.ts'],
    rules: {
      complexity: 'off',
      'max-depth': 'off',
      'max-params': 'off',
    },
  },
  // DTO validators — switch-based validation logic
  {
    files: ['**/dto/**/*.ts'],
    rules: {
      complexity: ['error', 15],
    },
  },
];
