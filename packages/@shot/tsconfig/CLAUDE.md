# @shot/tsconfig

Shared TypeScript configurations.

## Configs

| Config | Extends | Used by | Key settings |
|---|---|---|---|
| `base.json` | — | All others | ES2022, strict, ESNext modules, bundler resolution |
| `library.json` | base | `@shot/db`, `@shot/clickhouse`, `@shot/sdk-*` | CommonJS output, Node resolution |
| `nestjs.json` | base | `@shot/api`, `@shot/ingest`, `@shot/processor` | CommonJS, decorators, decorator metadata, incremental |
| `react.json` | base | `@shot/web` | JSX react-jsx, DOM libs, no emit |

## Usage

```json
{
  "extends": "@shot/tsconfig/nestjs.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

## Notes

- No root `tsconfig.json` in the monorepo — `tsc --noEmit` must run per-package
- Server packages need `"types": ["node"]` in their own tsconfig
- `strictPropertyInitialization: false` typically added for NestJS apps (DI)
