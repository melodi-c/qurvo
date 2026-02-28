const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');

/**
 * Base ESLint config — rules that do NOT require type-checking.
 * Use directly for fast linting or combine with `typeAware` for full checks.
 */
const base = [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // Complexity
      complexity: ['error', 6],
      'max-depth': ['error', 4],
      'max-params': ['error', 4],

      // Best practices
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      curly: ['error', 'all'],
      'no-console': ['error', { allow: ['warn', 'error'] }],

      // TypeScript (syntax-only, no type info needed)
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],

      // Ban `as unknown` casts
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAsExpression > TSUnknownKeyword',
          message: 'Avoid "as unknown" casts — use a type guard or explicit intermediate type instead.',
        },
      ],
    },
  },
  // Relaxed rules for test files — tests legitimately use any, non-null assertions, etc.
  {
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/test/**/*.ts',
      '**/test/**/*.tsx',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-restricted-syntax': 'off',
      complexity: 'off',
      'max-depth': 'off',
      'max-params': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '.turbo/'],
  },
];

/**
 * Type-aware ESLint config — rules that REQUIRE `parserOptions.project`.
 * Must be used after setting `parserOptions.project` in consuming config.
 *
 * @param {string} tsconfigPath - path to tsconfig.json (e.g. './tsconfig.json')
 */
function typeAware(tsconfigPath) {
  return [
    {
      files: ['**/*.ts', '**/*.tsx'],
      languageOptions: {
        parser: tsParser,
        parserOptions: {
          ecmaVersion: 2022,
          sourceType: 'module',
          project: tsconfigPath,
        },
      },
      plugins: {
        '@typescript-eslint': tsPlugin,
      },
      rules: {
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-misused-promises': 'error',
        '@typescript-eslint/await-thenable': 'error',
        '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      },
    },
  ];
}

module.exports = { base, typeAware };
