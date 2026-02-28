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
      complexity: ['warn', 6],
      'max-depth': ['warn', 4],
      'max-params': ['warn', 4],

      // Best practices (warn initially; Issue #711 will upgrade to error after fixing violations)
      eqeqeq: ['warn', 'always'],
      'prefer-const': 'warn',
      curly: ['warn', 'all'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // TypeScript (syntax-only, no type info needed)
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],

      // Ban `as unknown` casts
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'TSAsExpression > TSUnknownKeyword',
          message: 'Avoid "as unknown" casts — use a type guard or explicit intermediate type instead.',
        },
      ],
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
        '@typescript-eslint/no-floating-promises': 'warn',
        '@typescript-eslint/no-misused-promises': 'warn',
        '@typescript-eslint/await-thenable': 'warn',
        '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      },
    },
  ];
}

module.exports = { base, typeAware };
