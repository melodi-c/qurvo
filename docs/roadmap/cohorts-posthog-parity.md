# Cohorts: PostHog Parity Roadmap

> Дата исследования: 2026-02-23

## Реализовано

### Типы условий (Behavioral)

- [x] Completed event (PerformEvent) — `event` (count_operator + count)
- [x] Did not complete event (NotPerformedEvent) — `not_performed_event`
- [x] Completed event multiple times (PerformMultipleEvents) — `event` с count_operator
- [x] Completed a sequence of events (PerformSequenceEvents) — `event_sequence`
- [x] Completed event for the first time (PerformEventFirstTime) — `first_time_event`
- [x] Completed event regularly (PerformEventRegularly) — `performed_regularly`
- [x] Stopped doing an event (StopPerformEvent) — `stopped_performing`
- [x] Started doing event again (StartPerformEventAgain) — `restarted_performing`

### Типы условий (Person/Cohort)

- [x] Have the property (HaveProperty) — `person_property` (is_set)
- [x] Do not have the property (NotHaveProperty) — `person_property` (is_not_set)
- [x] In cohort (InCohort) — `cohort` (negated=false)
- [x] Not in cohort (NotInCohort) — `cohort` (negated=true)

### Операторы свойств

- [x] equals / does not equal — `eq`, `neq`
- [x] contains / does not contain — `contains`, `not_contains`
- [x] matches regex / not matches regex — `regex`, `not_regex`
- [x] gt / gte / lt / lte
- [x] is set / is not set — `is_set`, `is_not_set`

### Структура и фичи

- [x] AND/OR группы — `CohortConditionGroup` (recursive AND/OR)
- [x] Static cohorts — CSV upload, duplicate-as-static, manual add/remove
- [x] Cohort as breakdown — `breakdown_type: 'cohort'` в Trend/Funnel
- [x] Event property filters — `event_filters` на всех event-условиях

---

## TODO

### P1 — Простые и полезные

- [ ] `not_performed_event_sequence` — "Не выполнил последовательность событий"
  - Обернуть SQL event_sequence в `NOT IN`
  - Файлы: `@qurvo/cohort-query/src/conditions/sequence.ts`, типы в `@qurvo/db`, фронтенд-компонент
- [ ] `in` / `not_in` (multi-value) — "country in [US, UK, DE]"
  - SQL: `expr IN ('v1','v2','v3')`
  - Файлы: `@qurvo/cohort-query/src/conditions/property.ts`, `PropertyConditionRow` (UI мульти-значений)
- [ ] `between` / `not_between` — числовой диапазон
  - SQL: `toFloat64OrZero(expr) BETWEEN {min} AND {max}`
  - Файлы: те же + UI два инпута (min/max)

### P2 — Средняя сложность

- [ ] Date-операторы (`is_date_before`, `is_date_after`, `is_date_exact`)
  - SQL: `parseDateTimeBestEffort(expr)` + сравнение
  - Нужен date picker в UI
- [ ] `contains_multi` / `not_contains_multi` — несколько подстрок
  - SQL: `multiSearchAny(expr, ['v1','v2'])`

### P3 — Существенная фича

- [ ] Event aggregation math — "sum(revenue) > 1000", "avg(price) >= 50"
  - PostHog: Total/Unique/WAU/MAU + property math (avg, sum, min, max, p75-p99)
  - Qurvo: только count
  - Добавить `aggregation_type` + `aggregation_property` к event-условиям, расширить SQL builder

### Не планируется (PostHog-специфичные)

- [ ] ~~Semver операторы (8 шт.)~~ — специфичны для feature flags
- [ ] ~~flag_evaluates_to~~ — feature flag evaluations
- [ ] ~~cleaned_path / cleaned_path_exact~~ — URL normalization

---

## Источники

- `BehavioralEventType`: `posthog/frontend/src/scenes/cohorts/CohortFilters/types.ts`
- `BehavioralCohortType`: там же
- `BehavioralLifecycleType`: там же
- `PropertyOperator`: `posthog/frontend/src/types.ts` — 35 операторов
- Cohort API: `posthog/posthog/api/cohort.py`
