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
];
