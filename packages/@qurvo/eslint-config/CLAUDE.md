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
| `complexity` | warn | max 6 |
| `max-depth` | warn | max 4 |
| `max-params` | warn | max 4 |
| `eqeqeq` | warn | always (Issue #711 will upgrade to error) |
| `prefer-const` | warn | (Issue #711 will upgrade to error) |
| `curly` | warn | all (Issue #711 will upgrade to error) |
| `no-console` | warn | allows `console.warn`, `console.error` |
| `@typescript-eslint/no-explicit-any` | warn | |
| `@typescript-eslint/no-unused-vars` | warn | ignores `_` prefixed params |
| `@typescript-eslint/no-non-null-assertion` | warn | |
| `@typescript-eslint/prefer-optional-chain` | warn | |
| `@typescript-eslint/consistent-type-imports` | warn | prefer type-imports |
| `no-restricted-syntax` | warn | bans `as unknown` casts |

## Type-Aware Rules

| Rule | Level |
|---|---|
| `@typescript-eslint/no-floating-promises` | warn |
| `@typescript-eslint/no-misused-promises` | warn |
| `@typescript-eslint/await-thenable` | warn |
| `@typescript-eslint/no-unnecessary-type-assertion` | warn |

## Scope

- Files: `**/*.ts`, `**/*.tsx`
- Ignores: `dist/`, `node_modules/`, `.turbo/`
- Parser: `@typescript-eslint/parser`
