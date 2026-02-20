# Processor App

NestJS background worker. No HTTP server. Consumes events from Redis Stream, resolves person identity, writes to ClickHouse.

## Commands

```bash
pnpm --filter @qurvo/processor dev          # watch mode
pnpm --filter @qurvo/processor build        # nest build → dist/
pnpm --filter @qurvo/processor start        # node dist/main.js

# Integration tests (requires infra:up)
pnpm --filter @qurvo/processor test:integration
```

## Architecture

```
src/
├── app.module.ts                  # Root: LoggerModule + ProcessorModule
├── main.ts                        # NestFactory.createApplicationContext (no HTTP)
├── constants.ts                   # Stream, flush, DLQ configuration
├── processor/
│   ├── processor.module.ts        # All providers + services, OnApplicationShutdown
│   ├── event-consumer.service.ts  # XREADGROUP loop + XAUTOCLAIM
│   ├── flush.service.ts           # Buffer → ClickHouse batch insert
│   ├── person-resolver.service.ts # Person ID resolution + $identify
│   ├── person-writer.service.ts   # PostgreSQL person upsert + merge
│   ├── dlq.service.ts             # Dead letter queue replay
│   ├── insert.ts                  # ClickHouse insert helper
│   ├── utils.ts                   # Redis field parsing
│   └── geo.ts                     # GeoIP lookup
├── providers/
│   ├── redis.provider.ts
│   ├── clickhouse.provider.ts
│   └── drizzle.provider.ts
└── test/
    ├── setup.ts
    ├── helpers/
    └── processor/
```

## Processing Pipeline

```
Redis Stream (events:incoming)
  → XREADGROUP (consumer group: processor-group)
  → GeoIP lookup
  → Person resolution (get-or-create person_id)
  → Buffer (max 1000 events)
  → Flush to ClickHouse (every 5s or on threshold)
  → XACK (confirm consumption)
```

## Services

| Service | Responsibility | Key config |
|---|---|---|
| `EventConsumerService` | XREADGROUP loop, XAUTOCLAIM for pending | Claim idle >60s every 30s, backpressure on full buffer |
| `FlushService` | Buffer events, batch insert to ClickHouse | 1000 events or 5s interval, 3 retries then DLQ |
| `PersonResolverService` | Atomic get-or-create person_id via Redis+PG | Redis SET NX with 90d TTL, PG cold-start fallback |
| `PersonWriterService` | Person/mapping upserts, identity merge | `$set`/`$set_once`/`$unset` property merge, transactional |
| `DlqService` | Replay dead-letter events | 100 events every 5min, circuit breaker (5 failures, 5min reset) |

## Key Patterns

### Person Resolution
```
1. Redis GET person:{projectId}:{distinctId}
2. Miss → PostgreSQL lookup
3. Miss → Create new person (UUID) + Redis SET NX
4. $identify → merge anonymous + known person, write override to ClickHouse
```

### Identity Merging ($identify)
When `$identify` event arrives with `anonymous_id`:
1. Resolve both anonymous and user person_ids
2. Write override to `person_distinct_id_overrides` table (ClickHouse)
3. Merge PostgreSQL person records (fire-and-forget)
4. Update Redis cache

### Dead Letter Queue
Failed batches (3 retries exhausted) → `events:dlq` stream (MAXLEN 100k). `DlqService` replays with circuit breaker and distributed lock.

### Graceful Shutdown
`ProcessorModule` implements `OnApplicationShutdown`:
1. Stop consumer loop
2. Final flush of remaining buffer
3. Close Redis/ClickHouse/PostgreSQL connections

## Integration Tests

Tests in `src/test/processor/`. 4 tests covering:
- Single event processing, batch processing, person_id assignment, $identify merging
