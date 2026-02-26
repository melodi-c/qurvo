# Insights Worker App

NestJS background worker. No HTTP server. Periodically scans all projects for significant metric changes and newly appearing events, then persists AI-generated insights to PostgreSQL.

## Commands

```bash
pnpm --filter @qurvo/insights-worker dev          # watch mode
pnpm --filter @qurvo/insights-worker build        # nest build → dist/
pnpm --filter @qurvo/insights-worker start        # node dist/main.js
```

## Architecture

```
src/
├── app.module.ts                            # Root: workerLoggerModule() + InsightsModule
├── main.ts                                  # bootstrapWorker() from @qurvo/worker-core (env validation, no HTTP)
├── constants.ts                             # Interval (24h), initial delay (30s), metric change threshold (20%)
├── tracer.ts                                # Datadog APM init (imported first in main.ts)
├── insights/
│   ├── insights.module.ts                   # DrizzleProvider + ClickHouseProvider + services
│   ├── insight-discovery.service.ts         # Periodic cycle: detectMetricChanges + detectNewEvents per project
│   └── shutdown.service.ts                  # Graceful shutdown: stops service, closes PG pool
```

## How It Works

Every 24 hours (initial delay: 30s after startup):
1. Load all projects from PostgreSQL.
2. For each project, run two detections in parallel (`Promise.allSettled`):
   - **Metric change detection** — ClickHouse query compares last-24h event count to 7-day daily average. Reports top-5 events with `|pct_change| > 20%` and baseline avg > 10.
   - **New event detection** — finds events that appeared in the last 24h but were absent in the previous 7 days. Reports top-10 by count.
3. Each detected anomaly is saved as a row in `ai_insights` (PostgreSQL via Drizzle).

Failures for individual projects are caught and logged as warnings — a single failing project does not abort the cycle.

### Insight Types

| type            | trigger                                   |
|-----------------|-------------------------------------------|
| `metric_change` | event count deviates ≥ 20% from 7d avg   |
| `new_event`     | event name not seen in prior 7 days       |

### Constants (`src/constants.ts`)

- `INSIGHTS_INTERVAL_MS` — 24 hours
- `INSIGHTS_INITIAL_DELAY_MS` — 30 seconds
- `METRIC_CHANGE_THRESHOLD` — 0.20 (20%)

### ClickHouse Queries

`detectMetricChanges` uses two CTEs: `last_24h` (count per event, last day) and `last_7d` (avg daily count, days 2–7). The percentage change filter is applied in the outer `WHERE`. Only events with a 7-day baseline avg > 10 are considered to avoid noise from rare events.

`detectNewEvents` uses a `NOT IN` sub-query to exclude events seen in the prior 7 days. This is the correct ClickHouse pattern — do NOT rewrite as a LEFT JOIN + IS NULL check (LEFT JOIN returns default values, not NULL, for unmatched rows on non-Nullable columns).

## Important: Do NOT Delete

- **`src/tracer.ts`** and the `dd-trace` dependency — Datadog APM, loaded via `-r` flag at runtime.
