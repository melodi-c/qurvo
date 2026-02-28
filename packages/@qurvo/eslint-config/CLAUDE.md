# @qurvo/eslint-config

Shared ESLint configuration. ESLint v9 flat config format (CJS).

## Exports

- **`base`** — array of flat config objects with syntax-only rules (no type-checking required)
- **`typeAware(tsconfigPath)`** — function returning array of flat config objects with type-checked rules

## Usage

```javascript
// eslint.config.js (CJS)
const { base, typeAware } = require('@qurvo/eslint-config');

module.exports = [
  ...base,
  ...typeAware('./tsconfig.json'),
];
```

## Base Rules

| Rule | Level | Notes |
|---|---|---|
| `complexity` | error | max 6 |
| `max-depth` | error | max 4 |
| `max-params` | error | max 4 |
| `eqeqeq` | error | always |
| `prefer-const` | error | |
| `curly` | error | all |
| `no-console` | error | allows `console.warn`, `console.error` |
| `@typescript-eslint/no-explicit-any` | error | off in test files |
| `@typescript-eslint/no-unused-vars` | error | ignores `_` prefixed params |
| `@typescript-eslint/no-non-null-assertion` | error | off in test files |
| `@typescript-eslint/prefer-optional-chain` | error | |
| `@typescript-eslint/consistent-type-imports` | error | prefer type-imports |
| `no-restricted-syntax` | error | bans `as unknown` casts; off in test files |

## Type-Aware Rules

| Rule | Level |
|---|---|
| `@typescript-eslint/no-floating-promises` | error |
| `@typescript-eslint/no-misused-promises` | error |
| `@typescript-eslint/await-thenable` | error |
| `@typescript-eslint/no-unnecessary-type-assertion` | error |

## Test File Overrides

Test files (`*.test.ts`, `*.spec.ts`, `test/**/*.ts` and `.tsx` variants) have relaxed rules:
- `no-explicit-any`, `no-non-null-assertion`, `no-restricted-syntax` — off
- `complexity`, `max-depth`, `max-params` — off

## Scope

- Files: `**/*.ts`, `**/*.tsx`
- Ignores: `dist/`, `node_modules/`, `.turbo/`, `vitest.config.ts`, `vitest.*.config.ts`, `scripts/`
- Parser: `@typescript-eslint/parser`
