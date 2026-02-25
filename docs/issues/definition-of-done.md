# Definition of Done — Чеклист выполнения задачи

Этот чеклист выполняется ПОСЛЕ реализации фичи, в изолированном git worktree.

## 1. Тесты

- Запусти unit-тесты затронутых приложений
- Запусти интеграционные тесты если они есть или нужны
- Если важные тесты (особенно интеграционные) отсутствуют — напиши их

Команды:
```bash
pnpm --filter @qurvo/<app> exec vitest run
pnpm --filter @qurvo/<app> exec vitest run --config vitest.integration.config.ts
```

## 2. Миграции

- Если изменилась схема PostgreSQL → сгенерируй миграцию: `pnpm --filter @qurvo/db db:generate`
- Если изменилась схема ClickHouse → создай новый migration файл: `pnpm ch:generate <name>`

## 3. TypeScript

Проверь типы для затронутых приложений:
```bash
pnpm --filter @qurvo/web exec tsc --noEmit
pnpm --filter @qurvo/api exec tsc --noEmit
```

## 4. Build

Собери затронутые приложения:
```bash
pnpm --filter @qurvo/<app> build
```

Если ошибки — исправь их перед продолжением.

## 5. Если затронуто API-приложение — проверка OpenAPI

### 5.1 Сгенерировать спецификацию и API-клиент

```bash
# Сначала собери api (нужен для генерации swagger)
pnpm --filter @qurvo/api build

# Сгенерировать apps/api/docs/swagger.json
pnpm swagger:generate

# Сгенерировать apps/web/src/api/generated/Api.ts из swagger.json
pnpm generate-api
```

### 5.2 Проверить swagger.json на пустые типы

Найди все места, где тип — голый `object` без свойств (станет `object` на фронте):
```bash
# Схемы без properties и без $ref — пустые объекты
node -e "
const s = require('./apps/api/docs/swagger.json');
const schemas = s.components?.schemas || {};
const bad = Object.entries(schemas).filter(([name, schema]) => {
  return schema.type === 'object' && !schema.properties && !schema.allOf && !schema.oneOf;
});
if (bad.length) { console.log('BAD SCHEMAS (no properties):'); bad.forEach(([n]) => console.log(' -', n)); process.exit(1); }
else console.log('OK: no empty object schemas');
"

# Найти поля с type:object без properties в телах endpoints
grep -n '"type": "object"' apps/api/docs/swagger.json | head -30
```

### 5.3 Проверить сгенерированный Api.ts на плохие типы

```bash
# Голые object, Record<string, object>, any — всё что сломает типизацию фронта
grep -n ': object\b\|Record<string, object>\|: any\b' apps/web/src/api/generated/Api.ts
```

Если что-то нашлось — вернись к NestJS DTO/декораторам и исправь.

### 5.4 Типичные причины и как фиксить

| Симптом в Api.ts | Причина в NestJS | Фикс |
|---|---|---|
| `field: object` | `@ApiProperty()` без `type` | Добавь `type: MyDto` или `type: () => MyDto` |
| `field: object[]` | `@ApiProperty({ type: Array })` | Замени на `type: () => [MyDto]` |
| `data: object` | Нет `@ApiProperty()` совсем | Добавь декоратор с явным типом |
| `Record<string, object>` | `@ApiProperty({ type: 'object' })` | Используй `additionalProperties: { type: 'string' }` или конкретный тип |
| `any` | Generic-тип без указания в декораторе | Используй `@ApiExtraModels()` + `getSchemaPath()` |

## 6. Обновить CLAUDE.md

Если добавлены новые паттерны, архитектурные решения или важные gotcha — обнови `CLAUDE.md` соответствующего приложения.

## 7. Коммит

Сделай коммит всех изменений с осмысленным сообщением.

## 8. Финальная проверка с актуальным main

```bash
# Смерджи ЛОКАЛЬНЫЙ main в текущий worktree (не origin/main)
git merge main

# Запусти тесты ещё раз
pnpm --filter @qurvo/<app> exec vitest run

# Собери приложение ещё раз
pnpm --filter @qurvo/<app> build
```

Если ошибки — исправь.

## 9. Мерж в локальный main и пуш

```bash
# Из основного репозитория (не из worktree)
git checkout main
git merge <feature-branch>
git push origin main
```

## 10. SDK (если были правки)

Публикуй в порядке зависимостей: сначала `sdk-core`, затем `sdk-browser` и `sdk-node`:
```bash
pnpm --filter @qurvo/sdk-core publish --access public --no-git-checks
pnpm --filter @qurvo/sdk-browser publish --access public --no-git-checks
pnpm --filter @qurvo/sdk-node publish --access public --no-git-checks
```

## 11. Закрыть GitHub Issue

```bash
gh issue close <number> --comment "Реализовано и смерджено в main"
```

## 12. Очистить worktree

```bash
git worktree remove <worktree-path>
git branch -d <feature-branch>
```
