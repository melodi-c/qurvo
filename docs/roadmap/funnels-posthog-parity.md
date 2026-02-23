# Funnels: PostHog Parity Roadmap

> Дата исследования: 2026-02-23

## Реализовано

### Типы воронок

- [x] Ordered (sequential) — `windowFunnel()` strict order, 2-10 шагов

### Конверсионное окно

- [x] Configurable 1-90 days — передаётся в секундах в `windowFunnel()`

### Per-step фильтры

- [x] `eq` / `neq` / `contains` / `not_contains` / `is_set` / `is_not_set`
- [x] Фильтры по event properties (`properties.*`), person properties (`user_properties.*`), top-level columns (`browser`, `country`, `device_type`, `os`, `url`, `referrer`, `page_path`, `page_title`, `session_id`, `language`, `timezone`, `sdk_name`, `sdk_version`)

### Breakdown

- [x] Property breakdown — по event/user properties и top-level columns
- [x] Cohort breakdown — отдельный запрос на каждую когорту
- [x] Aggregate steps — backend суммирует totals по всем breakdown группам

### Глобальные фильтры

- [x] Cohort audience filter — `cohort_ids` ограничивает всю аудиторию воронки

### Метрики

- [x] Per-step: count, conversion_rate (vs step 1), drop_off, drop_off_rate (vs prev step)
- [x] Avg time to convert — step 1 → last step для полных конверсий

### Кэширование

- [x] Redis cache — 1h TTL, `force` bypass, keyed by widget_id + params hash

### Frontend

- [x] Drag-and-drop reorder шагов — HTML5 DnD
- [x] Plain funnel chart — CSS/div bars с hover tooltip
- [x] Breakdown funnel chart — grouped bars, 8-color palette, legend
- [x] Compact widget mode для dashboard cards
- [x] Date presets (7d/30d/90d/6m/1y) + custom range
- [x] Metrics bar (Overall Conversion, Entered, Completed)
- [x] Auto-refresh при stale > 30 минут

### Persistence & Integration

- [x] Saved insights — JSONB в PostgreSQL `insights` таблице
- [x] AI tool access — `query_funnel` для AI assistant

---

## TODO

### Bugfix

- [ ] **Cohort breakdown не передаётся из фронтенда**
  - `use-funnel.ts` передаёт только `breakdown_property`, не передаёт `breakdown_type` и `breakdown_cohort_ids`
  - Файлы: `apps/web/src/features/dashboard/hooks/use-funnel.ts`
  - Сложность: **S** (~30 минут)

---

### P1 — Высокий приоритет (ключевые аналитические фичи)

- [ ] **Conversion Rate Display: Overall vs Relative to Previous**
  - PostHog: переключатель `TOTAL` / `PREVIOUS` в визуализации
  - Qurvo: backend уже считает оба (`conversion_rate` vs step 1 + `drop_off_rate` vs prev), нет toggle в UI
  - Файлы: `apps/web/src/features/dashboard/components/widgets/funnel/FunnelChart.tsx`
  - Сложность: **S** (~0.5-1 день)

- [ ] **Conversion Window — гранулярные единицы**
  - PostHog: second, minute, hour, day, week, month
  - Qurvo: только days (1-90)
  - Backend уже передаёт в секундах — только конвертация + UI select
  - Файлы: `apps/api/src/api/dto/funnel.dto.ts`, `apps/api/src/funnel/funnel.query.ts`, `FunnelQueryPanel.tsx`
  - Сложность: **S** (~0.5-1 день)

- [ ] **Типы порядка шагов: Sequential / Strict / Any Order**
  - PostHog `FunnelOrderType`: `ORDERED` (default, между шагами могут быть другие события), `STRICT` (шаги строго подряд), `UNORDERED` (шаги в любом порядке)
  - Qurvo: только один режим через `windowFunnel()` ≈ ORDERED
  - Strict: `sequenceMatch()` или кастомный SQL с row_number
  - Any Order: `countIf` по каждому шагу отдельно, без `windowFunnel()`
  - Файлы: `apps/api/src/funnel/funnel.query.ts`, DTO, `FunnelQueryPanel.tsx`, `widgets.ts`
  - Сложность: **M** (~3-5 дней)

- [ ] **Time to Convert — распределение между шагами**
  - PostHog viz type `TIME_TO_CONVERT`: гистограмма времени конверсии между любыми двумя шагами
  - Qurvo: только общий `avg_time_to_convert_seconds` (step 1 → last step), нет per-step и нет распределения
  - Backend: вычислить `minIf(timestamp, step_condition)` для каждого шага, бакетирование для гистограммы
  - Frontend: новый Recharts BarChart компонент
  - Файлы: `funnel.query.ts`, новый viz component, `FunnelQueryPanel.tsx` (viz type selector)
  - Сложность: **M** (~3-5 дней)

- [ ] **Exclusion Steps (исключающие шаги)**
  - PostHog: события между шагами X и Y исключают пользователя из всей воронки
  - Конфигурация: `funnel_from_step`, `funnel_to_step`, event definition
  - Нужна пост-фильтрация в SQL: `AND NOT EXISTS (SELECT ... WHERE event_name = 'excluded' AND timestamp BETWEEN step_X_time AND step_Y_time)` или двухпроходный подход
  - Файлы: `funnel.query.ts`, DTO, `FunnelStepBuilder.tsx` (UI exclusion steps)
  - Сложность: **M** (~4-6 дней)

- [ ] **Historical Trends (конверсия во времени)**
  - PostHog viz type `TRENDS`: line chart конверсии по дням/неделям/месяцам
  - Нужен новый ClickHouse запрос: `toStartOfDay/Week/Month()` группировка + `windowFunnel()` для каждого bucket
  - Тяжёлый запрос — N sub-queries
  - Frontend: новый line chart (Recharts уже есть в проекте)
  - Файлы: `funnel.query.ts`, новый viz component, `FunnelQueryPanel.tsx`
  - Сложность: **L** (~5-8 дней)

---

### P2 — Средний приоритет (расширение возможностей)

- [ ] **Attribution Models для breakdown**
  - PostHog `BreakdownAttributionType`: `FIRST_TOUCH` (default), `LAST_TOUCH`, `ALL_EVENTS`, `STEP` (конкретный шаг)
  - Qurvo: только First Touch (`anyIf(expr, event_name = step_0)`)
  - Last Touch: `anyIf(expr, event_name = step_N)`. All Events: денормализация (один пользователь → несколько строк). Specific Step: аналогично First/Last по выбранному шагу
  - Файлы: `funnel.query.ts`, DTO, `BreakdownSection` component
  - Сложность: **M** (~2-4 дня)

- [ ] **Layout Toggle: Horizontal / Vertical**
  - PostHog `FunnelLayout`: `HORIZONTAL` / `VERTICAL`
  - Qurvo: только горизонтальный
  - Frontend-only: CSS transform / альтернативный layout
  - Файлы: `FunnelChart.tsx`
  - Сложность: **S** (~1-2 дня)

- [ ] **Inline Event Combination (OR-логика в шаге)**
  - PostHog: один шаг может содержать несколько event types через OR
  - Qurvo: один шаг = один `event_name`
  - Backend: `buildStepCondition()` → `event_name IN (X, Y, Z)` вместо `event_name = X`
  - DTO: `FunnelStepDto.event_name` → `event_names: string[]`
  - Файлы: `funnel.query.ts`, `funnel.dto.ts`, `widgets.ts`, `FunnelStepBuilder.tsx`
  - Сложность: **M** (~2-3 дня)

- [ ] **FunnelMathType (подсчёт событий)**
  - PostHog `FunnelMathType`: `TOTAL` (default), `FIRST_TIME_FOR_USER` (первое вхождение вообще), `FIRST_TIME_FOR_USER_WITH_FILTERS` (первое с фильтрами)
  - Qurvo: только Total
  - `FIRST_TIME_FOR_USER`: sub-query `SELECT person_id, min(timestamp) FROM events WHERE event_name = X GROUP BY person_id`
  - Файлы: `funnel.query.ts`, DTO, `FunnelStepBuilder.tsx`
  - Сложность: **M** (~2-3 дня)

- [ ] **Person-Level Drill-Down (список пользователей по шагу)**
  - PostHog: клик на шаг → список пользователей (converted / dropped off), сохранение как когорта, export CSV
  - Новый endpoint: модификация CTE для `person_id` списков + пагинация
  - Frontend: modal/drawer с таблицей пользователей, кнопка "Save as cohort"
  - Зависимости: нужен endpoint person details
  - Файлы: новый controller/service, `FunnelChart.tsx` (click handler)
  - Сложность: **L** (~5-8 дней)

- [ ] **Sampling для больших датасетов**
  - PostHog: query-level sampling (~10% → 3-10x speedup, 1-2% accuracy loss)
  - ClickHouse нативно поддерживает `SAMPLE 0.1`
  - Frontend: toggle/slider sampling rate
  - Файлы: `funnel.query.ts`, DTO, `FunnelQueryPanel.tsx`
  - Сложность: **S** (~1-2 дня)

- [ ] **Export PNG / CSV**
  - PostHog: export графика как PNG, user list как CSV
  - PNG: html2canvas или аналог
  - CSV: backend endpoint (зависит от Person Drill-Down)
  - Сложность: **S-M** (~2-3 дня)

---

### P3 — Низкий приоритет (продвинутые фичи)

- [ ] **Correlation Analysis**
  - PostHog: автоматически находит events/properties коррелирующие с конверсией/отвалом
  - `FunnelCorrelationResultsType`: `EVENTS`, `PROPERTIES`, `EVENT_WITH_PROPERTIES`
  - Статистика: chi-squared / Fisher exact test, confusion matrix, correlation score -1.0…1.0
  - Полностью новая подсистема: тяжёлые запросы (2x2 matrix на каждый event/property), ранжирование
  - Frontend: отдельная секция с таблицей корреляций, сортировка, фильтрация
  - Сложность: **XL** (~10-15 дней)

- [ ] **Funnel-to-Path Exploration**
  - PostHog `FunnelPathType`: `BEFORE_STEP`, `BETWEEN_STEPS`, `AFTER_STEP`
  - Из любого шага → path analysis (что делали до/после/между шагами)
  - Зависимость: сначала нужен Path Analysis как отдельная фича
  - Сложность: **XL** (~15-20 дней, вместе с Path Analysis)

- [ ] **Group Analytics (organization-level funnels)**
  - PostHog: агрегация по группам (организации, команды) вместо пользователей
  - Зависимость: нужна вся подсистема Group Analytics (schema, ingestion, query layer)
  - Сложность: **XL** (~15+ дней)

- [ ] **Unique Sessions агрегация**
  - PostHog: фильтрация по уникальным сессиям вместо уникальных пользователей
  - Qurvo: только person-level
  - Файлы: `funnel.query.ts` (GROUP BY session_id вместо person_id)
  - Сложность: **M** (~2-3 дня)

- [ ] **HogQL / Custom SQL Expressions**
  - PostHog: произвольные SQL выражения в фильтрах и breakdowns
  - SQL parser, validation, sandboxing — значительная security работа
  - Сложность: **XL** (~10-15 дней)

- [ ] **Subscriptions (Email/Slack нотификации)**
  - PostHog: расписание отправки результатов воронки
  - Отдельная подсистема: scheduler, email/Slack integration, rendering
  - Сложность: **L** (~8-10 дней)

- [ ] **Notebooks Integration**
  - PostHog: embed funnel insights в collaborative notebooks
  - Зависимость: нужна подсистема Notebooks
  - Сложность: **XL** (~10+ дней)

- [ ] **Share / Embed (публичные ссылки, iframe)**
  - PostHog: публичный share по ссылке, embed как iframe
  - Сложность: **M** (~3-5 дней)

---

### Не планируется (PostHog-специфичные)

- [ ] ~~Session Replay Integration~~ — отдельный продукт (запись DOM, хранение, воспроизведение)
- [ ] ~~A/B Test / Experiments Integration~~ — отдельная подсистема experiments
- [ ] ~~Actions as steps~~ — PostHog-специфичная абстракция (groups of events)

---

## Оценка трудозатрат

| Сложность | Кол-во фич | Ориентировочно |
|---|---|---|
| **Bugfix** | 1 | ~0.5 дня |
| **S (< 2 дня)** | 5 | ~5-8 дней |
| **M (2-5 дней)** | 7 | ~18-29 дней |
| **L (5-10 дней)** | 2 | ~13-18 дней |
| **XL (10+ дней)** | 5 | ~60-75 дней |
| **Итого без XL** | 15 | ~37-56 дней |
| **Итого всё** | 20 | ~97-131 дней |

---

## Источники

- PostHog docs: `posthog.com/docs/product-analytics/funnels`
- PostHog correlation docs: `posthog.com/docs/product-analytics/correlation`
- PostHog schema: `posthog/schema.py` — enums `FunnelOrderType`, `FunnelVizType`, `FunnelStepReference`, `FunnelConversionWindowTimeUnit`, `BreakdownAttributionType`, `FunnelMathType`, `FunnelCorrelationResultsType`, `FunnelLayout`, `FunnelPathType`
- Qurvo funnel query: `apps/api/src/funnel/funnel.query.ts`
- Qurvo funnel service: `apps/api/src/funnel/funnel.service.ts`
- Qurvo funnel DTO: `apps/api/src/api/dto/funnel.dto.ts`
- Qurvo funnel tests: `apps/api/src/test/funnel/funnel.integration.test.ts` (5 tests)
- Qurvo frontend: `apps/web/src/features/dashboard/components/widgets/funnel/`
