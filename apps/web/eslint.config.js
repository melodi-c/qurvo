import { createRequire } from 'node:module';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

const require = createRequire(import.meta.url);
const { base, typeAware } = require('@qurvo/eslint-config');

export default [
  // Global ignores
  {
    ignores: [
      'dist/',
      'storybook-static/',
      '.storybook/',
      'vite.config.ts',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/*.stories.tsx',
      '**/*.stories.ts',
    ],
  },
  // Shared base rules (syntax-only, no type-checking)
  ...base,
  // Shared type-aware rules (require tsconfig project)
  ...typeAware('./tsconfig.app.json'),
  // Web-specific: browser globals + React rules
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': 'warn',
    },
  },
  // React components — higher complexity thresholds due to JSX rendering logic,
  // conditional UI branches, and hook orchestration.
  {
    files: ['**/*.tsx'],
    rules: {
      complexity: ['error', 35],
      'max-depth': ['error', 6],
      // React component data often comes from queries with nullable types;
      // non-null assertions are a pragmatic pattern when enabled guards are in place.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  // Non-component TS utils, hooks, stores — moderate complexity for data transforms
  {
    files: ['**/*.ts'],
    rules: {
      complexity: ['error', 20],
      // Hook return values and query data are frequently narrowed via `enabled` guards
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  // React event handlers — onClick/onSubmit callbacks legitimately return promises
  // from async operations (mutations, navigations). Wrapping every handler in
  // void-returning thunks would reduce readability without improving safety.
  {
    files: ['**/*.tsx'],
    rules: {
      '@typescript-eslint/no-misused-promises': ['error', {
        checksVoidReturn: {
          attributes: false,
        },
      }],
    },
  },
];
