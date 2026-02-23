# Cohorts: PostHog Parity Roadmap

> Последнее обновление: 2026-02-23

## Паритет с PostHog

| Область | PostHog | Qurvo | Статус |
|---|---|---|---|
| Behavioral event conditions (8) | 8/8 | 8/8 | 100% |
| Lifecycle conditions (4) | 4/4 | 4/4 | 100% |
| Property operators (значимые) | 22 | 22 | 100% |
| Aggregation math | count + 9 property math | count + 9 property math | 100% |
| Cohort nesting (in/not in) | + topo sort | + circular detection + topo sort | 100% |
| Static cohorts + CSV | 3 типа ID (person_id, distinct_id, email) | distinct_id + email | 90% |
| Dynamic cohort calculation | 15 мин, selective | 15 мин, selective + toposort + error backoff | 100% |
| Cohort as breakdown | Да | Да | 100% |
| AND/OR nesting | 2 уровня (UI) | Рекурсивный (∞) | Qurvo лучше |

---

## Реализовано

### Типы условий (Behavioral)

- [x] Completed event (PerformEvent) — `event` (count_operator + count)
- [x] Did not complete event (NotPerformedEvent) — `not_performed_event`
- [x] Completed event multiple times (PerformMultipleEvents) — `event` с count_operator
- [x] Completed a sequence of events (PerformSequenceEvents) — `event_sequence`
- [x] Did not complete sequence — `not_performed_event_sequence`
- [x] Completed event for the first time (PerformEventFirstTime) — `first_time_event`
- [x] Completed event regularly (PerformEventRegularly) — `performed_regularly`
- [x] Stopped doing an event (StopPerformEvent) — `stopped_performing`
- [x] Started doing event again (StartPerformEventAgain) — `restarted_performing`

### Типы условий (Person/Cohort)

- [x] Have the property (HaveProperty) — `person_property` (is_set)
- [x] Do not have the property (NotHaveProperty) — `person_property` (is_not_set)
- [x] In cohort (InCohort) — `cohort` (negated=false)
- [x] Not in cohort (NotInCohort) — `cohort` (negated=true)

### Операторы свойств (22/22)

- [x] equals / does not equal — `eq`, `neq`
- [x] contains / does not contain — `contains`, `not_contains`
- [x] contains any of / not contains any of — `contains_multi`, `not_contains_multi`
- [x] matches regex / not matches regex — `regex`, `not_regex`
- [x] gt / gte / lt / lte
- [x] is set / is not set — `is_set`, `is_not_set`
- [x] in / not in — `in`, `not_in` (multi-value)
- [x] between / not between — `between`, `not_between` (числовой диапазон)
- [x] is date before / after / exact — `is_date_before`, `is_date_after`, `is_date_exact`

### Event aggregation math (8 типов)

- [x] count (default), sum, avg, min, max, median, p75, p90, p95, p99
- [x] `aggregation_type` + `aggregation_property` на event-условиях
- [x] Дробные threshold (Float64) для не-count агрегаций

### Структура и фичи

- [x] AND/OR группы — `CohortConditionGroup` (рекурсивные, неограниченная вложенность)
- [x] Static cohorts — CSV upload (distinct_id), duplicate-as-static, manual add/remove
- [x] Cohort as breakdown — `breakdown_type: 'cohort'` в Trend/Funnel
- [x] Event property filters — `event_filters` на всех event-условиях
- [x] Circular dependency detection — DFS в validation.ts
- [x] Person identity resolution — `person_overrides_dict` во всех запросах

---

## TODO

### P1 — Быстрые доработки

- [x] `median` aggregation — `quantile(0.50)` в event.ts
- [x] `p75` aggregation — `quantile(0.75)` в event.ts
- [x] Email CSV import — резолвить email → person_id через CH user_properties
  - Поддержка заголовка `email` / `e-mail` в CSV
  - SQL injection исправлен: `insertStaticMembers` через `ch.insert()` + параметризованные запросы

### P2 — Инфраструктура вычисления когорт

- [x] Selective recomputation — пересчитывать только stale когорты
  - Файл: `apps/processor/src/processor/cohort-membership.service.ts`
  - Логика: `WHERE membership_computed_at IS NULL OR < now() - interval '15 min'`
- [x] Topological computation order — зависимые когорты вычисляются первыми
  - Файл: `apps/processor/src/processor/cohort-toposort.ts` — Kahn's algorithm
- [x] Error tracking + exponential backoff
  - PG колонки: `errors_calculating`, `last_error_at`, `last_error_message`
  - Backoff: `2^min(errors, 10) * 30 min`, cap ~21 дней
  - Error reset при обновлении definition

### P3 — Cohort Growth (дифференциатор)

- [x] Cohort size history table — хранить count по дням
  - CH таблица: `cohort_membership_history` (ReplacingMergeTree)
  - Записывается при каждом успешном пересчёте
- [x] Cohort size history API — `GET :cohortId/history?days=30`
  - API endpoint для получения истории размера когорты по дням
- [x] Cohort size over time chart — визуализация роста/спада когорты
  - AreaChart (Recharts) на странице редактора когорты
  - Правая панель: count + history chart + error badge

### Не планируется (PostHog-специфичные)

- ~~Semver операторы (8 шт.)~~ — специфичны для feature flags
- ~~flag_evaluates_to~~ — feature flag evaluations
- ~~cleaned_path / cleaned_path_exact~~ — URL normalization
- ~~Realtime cohort evaluation~~ — bytecode-компиляция, нужна только для feature flags
- ~~WAU/MAU/Unique math в когортах~~ — insight-level агрегации, не фильтры когорт

---

## Источники

- `BehavioralEventType`: `posthog/frontend/src/scenes/cohorts/CohortFilters/types.ts`
- `BehavioralCohortType`: там же
- `BehavioralLifecycleType`: там же
- `PropertyOperator`: `posthog/frontend/src/types.ts` — 33 оператора (22 значимых)
- Cohort calculation: `posthog/posthog/tasks/calculate_cohort.py`
- Cohort SQL: `posthog/ee/clickhouse/queries/`
- Cohort API: `posthog/posthog/api/cohort.py`
