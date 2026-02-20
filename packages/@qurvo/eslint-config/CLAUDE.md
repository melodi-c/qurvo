# @qurvo/eslint-config

Shared ESLint configuration. ESLint v9 flat config format.

## Usage

```javascript
// eslint.config.js
import config from '@qurvo/eslint-config';
export default [...config];
```

## Rules

| Rule | Level | Notes |
|---|---|---|
| `@typescript-eslint/no-unused-vars` | warn | Ignores `_` prefixed params |
| `@typescript-eslint/no-explicit-any` | warn | |
| `no-console` | warn | Allows `console.warn` and `console.error` |

## Scope

- Files: `**/*.ts`, `**/*.tsx`
- Ignores: `dist/`, `node_modules/`, `.turbo/`
- Parser: `@typescript-eslint/parser`
