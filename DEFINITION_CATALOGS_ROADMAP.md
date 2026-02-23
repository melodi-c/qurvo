# Definition Catalogs — Полный список различий PostHog vs Qurvo

Статусы: `[ ]` — не сделано, `[x]` — сделано, `[~]` — частично, `[-]` — не нужно

---

## A. Sync-механизм (Processor / Write path)

### A1. [x] Throttle `last_seen_at` (floor to hour)
**Проблема**: Каждый flush (каждые 5с) обновляет `last_seen_at` для всех event/property definitions. Лишние PG writes.
**PostHog**: Округляет `last_seen_at` к ближайшему часу (`get_floored_last_seen()`). Один event definition обновляется максимум 1 раз в час.
**Решение**: Округлять `now` к часу. В SQL добавить `WHERE last_seen_at < excluded.last_seen_at`.
**Файлы**: `apps/processor/src/processor/definition-sync.service.ts`
**Сложность**: Низкая

### A2. [x] In-memory dedup cache
**Проблема**: Каждый batch делает full upsert в PG, даже если те же пары были записаны 5 секунд назад.
**PostHog**: 3-уровневая дедупликация — локальный batch (10K), shared cache (3×1M entries), consumer-side sort+dedup.
**Решение**: `Map<string, number>` в памяти. Пропускать если ключ уже в кэше и прошло < 1 часа. TTL eviction. Capacity ~100K.
**Файлы**: `apps/processor/src/processor/definition-sync.service.ts`
**Сложность**: Средняя

### A3. [ ] Retry механизм для sync
**Проблема**: При ошибке PG sync логирует warning и теряет данные до следующего batch.
**PostHog**: 3 retry с exponential backoff + jitter (50ms base). При полном провале — uncache для повторной попытки.
**Решение**: Обернуть upsert'ы в retry-логику (3 попытки, 100/200/400ms).
**Файлы**: `apps/processor/src/processor/definition-sync.service.ts`
**Сложность**: Низкая–Средняя

### A4. [ ] Не ставить тип для null/object/array
**Проблема**: `detectValueType()` возвращает `'String'` для null, object, array — некорректно.
**PostHog**: Возвращает `None` для непримитивов — `property_type` остаётся NULL, будет заполнен позже.
**Решение**: Возвращать `null`. В `syncFromBatch()` — не включать `value_type` в insert для таких свойств.
**Файлы**: `apps/processor/src/processor/definition-sync.service.ts`
**Сложность**: Низкая

### A5. [ ] Hard-coded overrides для типов свойств
**Проблема**: UTM `utm_campaign=12345` определится как Numeric, хотя это String.
**PostHog**: Overrides: `utm_*` → String, `$feature/*` → String, `$survey_response*` → String. Ключи с `time`/`date`/`_at` → усиленная DateTime эвристика.
**Решение**: Массив override-правил в `detectValueType()`.
**Файлы**: `apps/processor/src/processor/definition-sync.service.ts`
**Сложность**: Низкая

### A6. [ ] Лимит на длину имени event/property
**Проблема**: Нет ограничения — event/property name может быть любой длины, потенциально мусорные данные.
**PostHog**: Дропает events с `name.len() > 200` или `property_name.len() > 200`.
**Решение**: Пропускать events/properties с именем длиннее 200 символов в `syncFromBatch()`.
**Файлы**: `apps/processor/src/processor/definition-sync.service.ts`
**Сложность**: Низкая

### A7. [ ] Лимит на количество свойств в одном event
**Проблема**: Нет ограничения — event с 100K свойств может положить sync.
**PostHog**: Дропает events с > 10,000 свойств (`update_count_skip_threshold`).
**Решение**: `if (Object.keys(bag).length > 10_000) continue;`
**Файлы**: `apps/processor/src/processor/definition-sync.service.ts`
**Сложность**: Низкая

### A8. [ ] Очистить мёртвый Redis кэш
**Проблема**: `FlushService.invalidateMetadataCaches()` инвалидирует Redis ключи (`event_names:*`, `event_property_names:*`), которые больше никто не читает — API теперь ходит в PG.
**Решение**: Удалить `invalidateMetadataCaches()` и связанные Redis operations.
**Файлы**: `apps/processor/src/processor/flush.service.ts`
**Сложность**: Низкая

### A9. [ ] Пропуск служебных свойств при sync
**Проблема**: Все свойства из properties/user_properties записываются как definitions, включая служебные.
**PostHog**: Пропускает `$set`, `$set_once`, `$unset`, `$group_0`–`$group_4`, `$groups` при извлечении свойств.
**Решение**: Список skip-свойств, проверка перед добавлением в propMap.
**Файлы**: `apps/processor/src/processor/definition-sync.service.ts`
**Сложность**: Низкая

### A10. [ ] Специальная обработка $set/$set_once как person properties
**Проблема**: `$set` и `$set_once` внутри `properties` — это person-свойства, но мы их трекаем как event properties.
**PostHog**: Свойства из `$set`/`$set_once` вложенных в `properties` тегируются как `PropertyParentType::Person`.
**Решение**: Если `properties` содержит `$set` или `$set_once`, извлечь их значения как person property definitions.
**Файлы**: `apps/processor/src/processor/definition-sync.service.ts`
**Сложность**: Средняя

### A11. [ ] Специальная обработка $groupidentify
**Проблема**: `$groupidentify` events не обрабатываются особо.
**PostHog**: Для `$groupidentify` — извлекает только `$group_set` свойства как group properties.
**Решение**: Может быть актуально когда/если добавим group analytics. Пока пропустить.
**Сложность**: N/A (зависит от group analytics)

---

## B. Схема БД

### B1. [ ] Поддержка group/session property types
**Проблема**: `property_type` ограничен `event` | `person`. Нет поддержки group и session.
**PostHog**: 4 типа: `1=EVENT`, `2=PERSON`, `3=GROUP`, `4=SESSION` + `group_type_index` для group.
**Решение**: Расширить enum до `event | person | group | session` когда понадобится.
**Сложность**: Средняя (потребует миграцию)

### B2. [ ] Duration value type
**Проблема**: Нет типа Duration для свойств длительности.
**PostHog**: Поддерживает `Duration` как один из value_type.
**Решение**: Добавить `Duration` в value_type когда понадобится форматирование длительности.
**Сложность**: Низкая

### B3. [ ] GIN trigram индекс для fuzzy search
**Проблема**: Только B-tree индексы — поиск по подстроке требует seq scan.
**PostHog**: GIN trigram индексы на `name` для fuzzy matching (`gin_trgm_ops`).
**Решение**: `CREATE INDEX ... USING GIN (event_name gin_trgm_ops)` — после добавления серверного поиска.
**Файлы**: Drizzle миграция
**Сложность**: Низкая

### B4. [ ] ClickHouse mirror для property_definitions
**Проблема**: Нет CH-mirror для property_definitions.
**PostHog**: `ReplacingMergeTree` с version-column приоритезирующим non-null property_type.
**Решение**: Вероятно не нужно — у нас нет CH-зависимых flows для definitions. Оценить позже.
**Сложность**: N/A

### B5. [ ] Поле `hidden` на event/property definitions
**Проблема**: Нет возможности скрыть устаревшие events/properties из UI без удаления.
**PostHog**: `hidden: boolean` (mutually exclusive с `verified`). `exclude_hidden=true` в API.
**Решение**: Добавить `hidden boolean NOT NULL DEFAULT false` в обе таблицы. Фильтровать в API по дефолту.
**Файлы**: Миграция + service + DTO + frontend
**Сложность**: Средняя

### B6. [ ] Поле `owner` на event definitions
**Проблема**: Нет владельца события — непонятно кто ответственный за определение.
**PostHog**: `owner: FK -> User` на event_definitions.
**Решение**: Добавить `owner_id uuid REFERENCES users(id)`.
**Сложность**: Низкая–Средняя

### B7. [ ] Поля `verified_at` / `verified_by`
**Проблема**: Есть `verified: boolean`, но нет информации когда и кем подтверждено.
**PostHog**: `verified_at: DateTimeField`, `verified_by: FK -> User`.
**Решение**: Добавить 2 колонки в обе таблицы.
**Сложность**: Низкая

### B8. [ ] Поле `updated_by`
**Проблема**: Есть `updated_at`, но нет `updated_by` — непонятно кто последний менял описание.
**PostHog**: `updated_by: FK -> User`.
**Решение**: Добавить `updated_by uuid REFERENCES users(id)`. Передавать userId из контроллера в upsert.
**Сложность**: Низкая

### B9. [ ] `display_name` для event/property
**Проблема**: Имена events/properties отображаются as-is (`page_view`). Нет human-readable display name.
**PostHog**: Нет отдельного поля, но есть система alias'ов (`PROPERTY_NAME_ALIASES`) для поиска.
**Решение**: Можно добавить `display_name varchar(500)` позже если будет запрос.
**Сложность**: Низкая

### B10. [ ] `enforcement_mode` на event definitions
**Проблема**: Нет способа reject неизвестные/неверифицированные события на уровне ingestion.
**PostHog**: `enforcement_mode: 'allow' | 'reject'`. С `reject` — ingest отклоняет события не из каталога.
**Решение**: Добавить позже когда будет запрос на schema enforcement.
**Сложность**: Высокая (затрагивает ingest pipeline)

---

## C. API Layer (Read path)

### C1. [ ] Серверный search
**Проблема**: Нет серверного поиска, client-side substring filter.
**PostHog**: GIN trigram fuzzy search + alias expansion + "latest means not initial".
**Решение**: `?search=query` → `WHERE event_name ILIKE '%query%'`. GIN trigram позже.
**Файлы**: services + DTOs + controllers + frontend hooks
**Сложность**: Средняя

### C2. [ ] Пагинация
**Проблема**: Все list-эндпоинты возвращают неограниченный набор.
**PostHog**: `LimitOffsetPagination` без count (`NotCountingLimitOffsetPaginator`).
**Решение**: limit/offset. Дефолт 100, max 500. Frontend DataTable уже поддерживает пагинацию.
**Файлы**: services + DTOs + controllers + frontend
**Сложность**: Средняя

### C3. [ ] Настраиваемый ordering
**Проблема**: Фиксированный `ORDER BY last_seen_at DESC`.
**PostHog**: Supports `name`, `last_seen_at`, `-last_seen_at`, `last_seen_at::date`.
**Решение**: `?ordering=name|-name|last_seen_at|-last_seen_at` query parameter.
**Сложность**: Низкая

### C4. [ ] Фильтр `exclude_hidden`
**Проблема**: Нет — зависит от B5 (hidden field).
**PostHog**: `?exclude_hidden=true` — фильтрует скрытые definitions.
**Решение**: Реализовать после B5.
**Сложность**: Низкая (после B5)

### C5. [ ] Фильтр `is_numerical`
**Проблема**: Нет серверного фильтра по числовым свойствам.
**PostHog**: `?is_numerical=true` на property definitions.
**Решение**: `?is_numerical=true` → `WHERE is_numerical = true`. Полезно для math aggregation selectors.
**Сложность**: Низкая

### C6. [ ] `event_names[]` + `is_seen_on_filtered_events`
**Проблема**: Query builder не знает какие свойства относятся к выбранным событиям.
**PostHog**: `?event_names=["a","b"]` → LEFT JOIN event_properties → `is_seen_on_filtered_events: boolean`.
**Решение**: Добавить query parameter и LEFT JOIN.
**Файлы**: property-definitions service + DTO + controller + frontend query builder
**Сложность**: Средняя

### C7. [ ] `filter_by_event_names` (строгий фильтр)
**Проблема**: Нельзя получить ТОЛЬКО свойства конкретных событий (без остальных).
**PostHog**: `?filter_by_event_names=true` с `event_names` → INNER JOIN вместо LEFT JOIN.
**Решение**: Если `filter_by_event_names=true`, использовать INNER JOIN.
**Сложность**: Низкая (после C6)

### C8. [ ] `excluded_properties` фильтр
**Проблема**: Нет возможности исключить определённые свойства из выдачи.
**PostHog**: `?excluded_properties=["$set","$set_once"]` — JSON массив исключений.
**Решение**: `WHERE property_name NOT IN (...)`.
**Сложность**: Низкая

### C9. [ ] `exclude_core_properties` фильтр
**Проблема**: Нет возможности исключить системные свойства (с `$` префиксом).
**PostHog**: `?exclude_core_properties=true` — исключает `$`-prefixed и taxonomy-defined.
**Решение**: `WHERE property_name NOT LIKE '$%'`.
**Сложность**: Низкая

### C10. [ ] Batch property fetch (`?properties=a,b,c`)
**Проблема**: Нельзя запросить metadata для конкретного набора свойств одним запросом.
**PostHog**: `?properties=url,email,plan` — одним запросом получить metadata для списка.
**Решение**: `WHERE property_name IN (...)` по query parameter.
**Сложность**: Низкая

### C11. [ ] `seen_together` endpoint
**Проблема**: Нельзя узнать с какими событиями встречается конкретное свойство.
**PostHog**: `GET .../seen_together?event_names=["a","b"]&property_name=foo` → `{a: true, b: false}`.
**Решение**: Отдельный endpoint, запрос к event_properties.
**Сложность**: Низкая

### C12. [ ] `by_name` exact lookup endpoint
**Проблема**: Нет быстрого получения definition по точному имени.
**PostHog**: `GET .../by_name?name=page_view` — точный поиск.
**Решение**: Отдельный endpoint или query parameter.
**Сложность**: Низкая

### C13. [ ] Metrics endpoint (volume from ClickHouse)
**Проблема**: Нет информации о частоте события (сколько раз за 30 дней).
**PostHog**: `GET .../{id}/metrics` — on-demand запрос в CH, кэш 24h.
**Решение**: Endpoint с `SELECT count() FROM events WHERE event_name = ? AND timestamp > now() - INTERVAL 30 DAY`. Redis cache 24h.
**Сложность**: Средняя

### C14. [ ] DELETE endpoint
**Проблема**: Definitions append-only, нельзя удалить устаревшие.
**PostHog**: `DELETE` endpoint на обоих ViewSet'ах.
**Решение**: Добавить DELETE endpoint. Каскадно удалить event_properties при удалении event_definition.
**Сложность**: Низкая

### C15. [ ] value_type editable через API
**Проблема**: First type wins, нет ручного override. Если тип определился неправильно — нельзя исправить.
**PostHog**: Free users могут менять `property_type` через PATCH.
**Решение**: Добавить `value_type` и `is_numerical` в `UpsertPropertyDefinitionDto`.
**Сложность**: Низкая

### C16. [ ] Activity log для изменений definitions
**Проблема**: Нет аудит-лога кто и когда изменил описание/теги/verified.
**PostHog**: Все изменения логируются в activity log системе.
**Решение**: Оценить позже — требует общую activity log инфраструктуру.
**Сложность**: Высокая

---

## D. Frontend

### D1. [ ] Standalone property definitions page
**Проблема**: Свойства видны только в контексте конкретного event. Нет общего списка.
**PostHog**: Отдельная вкладка "Properties" в Data Management.
**Решение**: Новая страница/вкладка с полным списком property_definitions, фильтры по type/search/value_type.
**Файлы**: `apps/web/src/pages/property-definitions.tsx` (новый) + routes + router
**Сложность**: Средняя

### D2. [ ] Query builder integration с definition catalogs
**Проблема**: Event/property selectors в query builder не используют definition catalogs.
**PostHog**: TaxonomicFilter — универсальный picker с серверным search, `is_seen_on_filtered_events`, virtual properties.
**Решение**: Combobox'ы в query panels должны запрашивать definitions API вместо ClickHouse.
**Сложность**: Средняя–Высокая

### D3. [ ] Global property definitions cache на frontend
**Проблема**: Каждый mount компонента → новый fetch (TanStack Query staleTime = 0).
**PostHog**: Permanently mounted `propertyDefinitionsModel` — lazy-load + batch fetch до 50 props, debounce 10ms.
**Решение**: Увеличить `staleTime` в TanStack Query (5-60 минут). Или: global store + batch fetch pattern.
**Сложность**: Низкая (staleTime) – Средняя (global store)

### D4. [ ] Code generation endpoints (TypeScript/Go/Python SDK types)
**Проблема**: Нет автогенерации SDK типов из каталога событий.
**PostHog**: `GET .../typescript`, `GET .../golang`, `GET .../python` — генерация типизированных SDK definitions.
**Решение**: Nice-to-have для developer experience.
**Сложность**: Средняя

### D5. [ ] Value formatting в UI по value_type
**Проблема**: Все значения свойств отображаются как строки.
**PostHog**: `formatPropertyValueForDisplay()` — DateTime formatting (unix sec/ms/ISO), Duration formatting, etc.
**Решение**: Utility function для форматирования значений по value_type.
**Сложность**: Низкая

---

## E. Архитектурные различия (не являются проблемами)

Различия по дизайну, не требующие действий:

| Аспект | PostHog | Qurvo | Комментарий |
|---|---|---|---|
| Sync сервис | Отдельный Rust binary (property-defs-rs) | NestJS service внутри processor | OK — наш масштаб не требует отдельного сервиса |
| Kafka | Kafka consumer | Fire-and-forget из FlushService | OK — Redis Streams проще, sync inline вместо отдельного consumer |
| Property name storage | Чистое имя (`url`) + `type` column | С префиксом (`properties.url`) | Другой подход, оба корректны. Префикс удобнее для UI |
| event_properties.property_type | Нет в PostHog | Есть у нас | У нас точнее — различаем event vs person associations |
| event_properties.last_seen_at | Нет в PostHog | Есть у нас | У нас точнее |
| Enterprise metadata | Отдельная таблица (Django MTI) | В той же таблице | OK — у нас нет free/enterprise split |
| Tags | Отдельная tagging система (TaggedItemSerializerMixin) | PG text array | OK для нашего масштаба |
| Batch SQL | UNNEST arrays | Drizzle multi-row INSERT | Функционально эквивалентно |
