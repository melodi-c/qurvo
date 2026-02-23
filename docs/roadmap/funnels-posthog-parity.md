# Funnels: PostHog Parity Roadmap

> Дата исследования: 2026-02-23

## Реализовано

### Типы воронок

- [x] Ordered (sequential) — `windowFunnel()` strict order, 2-10 шагов
- [x] Strict — `windowFunnel('strict_order')`, убран `event_name IN(...)` фильтр чтобы все события были видны
- [x] Unordered (Any Order) — кастомный CTE с `minIf` per-step, `least()` для anchor timestamp

### Конверсионное окно

- [x] Configurable 1-90 days — передаётся в секундах в `windowFunnel()`
- [x] Гранулярные единицы: second, minute, hour, day, week, month — `UNIT_TO_SECONDS` маппинг

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
- [x] Conversion Rate Display — toggle Overall (vs step 1) / Relative (vs previous step) в UI

### Time to Convert

- [x] Отдельный endpoint `GET funnel/time-to-convert` — распределение времени конверсии между любыми двумя шагами
- [x] Auto-binning гистограмма (cube root rule), average/median/sample_size
- [x] Backend: `groupArrayIf()` + TypeScript-side histogram binning

### Exclusion Steps

- [x] Per-step range exclusions (`funnel_from_step` → `funnel_to_step`)
- [x] Двухпроходный SQL: `funnel_per_user` CTE + `excluded_users` CTE + `NOT IN` фильтр
- [x] Frontend: `FunnelExclusionBuilder` компонент с event combobox и step range selectors

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
- [x] Order type selector (PillToggleGroup: ordered/strict/unordered)
- [x] Conversion window: value input + unit selector (second → month)
- [x] Conversion rate display toggle (total/relative)
- [x] Exclusion steps builder

### Persistence & Integration

- [x] Saved insights — JSONB в PostgreSQL `insights` таблице
- [x] AI tool access — `query_funnel` для AI assistant

### Тесты

- [x] 11 интеграционных тестов: 3-step funnel, window enforcement, empty, step filters, breakdown, strict order, unordered, exclusions, conversion window units, time-to-convert (2)

---

## TODO

### P1 — Высокий приоритет (ключевые аналитические фичи)

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

## Оценка трудозатрат (оставшееся)

| Сложность | Кол-во фич | Ориентировочно |
|---|---|---|
| **S (< 2 дня)** | 2 | ~2-4 дня |
| **M (2-5 дней)** | 5 | ~11-18 дней |
| **L (5-10 дней)** | 3 | ~18-26 дней |
| **XL (10+ дней)** | 5 | ~60-75 дней |
| **Итого без XL** | 10 | ~31-48 дней |
| **Итого всё** | 15 | ~91-123 дней |

---

## Источники

- PostHog docs: `posthog.com/docs/product-analytics/funnels`
- PostHog correlation docs: `posthog.com/docs/product-analytics/correlation`
- PostHog schema: `posthog/schema.py` — enums `FunnelOrderType`, `FunnelVizType`, `FunnelStepReference`, `FunnelConversionWindowTimeUnit`, `BreakdownAttributionType`, `FunnelMathType`, `FunnelCorrelationResultsType`, `FunnelLayout`, `FunnelPathType`
- Qurvo funnel query: `apps/api/src/funnel/funnel.query.ts`
- Qurvo funnel service: `apps/api/src/funnel/funnel.service.ts`
- Qurvo funnel DTO: `apps/api/src/api/dto/funnel.dto.ts`
- Qurvo funnel tests: `apps/api/src/test/funnel/funnel.integration.test.ts` (11 tests)
- Qurvo frontend: `apps/web/src/features/dashboard/components/widgets/funnel/`
