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
2. For each project, run four detections in parallel (`Promise.allSettled`):
   - **Metric change detection** — ClickHouse query compares last-24h event count to 7-day daily average. Reports top-5 events with `|pct_change| > 20%` and baseline avg > 10.
   - **New event detection** — finds events that appeared in the last 24h but were absent in the previous 7 days. Reports top-10 by count.
   - **Retention anomaly detection** — compares week-1 retention rate for this week's day-0 cohort (users who first did event X 14–7 days ago) against last week's cohort (21–14 days ago). Reports top-5 events with a retention drop > 20 percentage points. Minimum cohort size: 10 users.
   - **Conversion correlation detection** — finds top-5 events by frequency, then for each identifies intermediate events with relative lift > 50%. Only reports if sample size ≥ 30.
3. Each detected anomaly is saved as a row in `ai_insights` (PostgreSQL via Drizzle).

Failures for individual projects are caught and logged as warnings — a single failing project does not abort the cycle.

### Insight Types

| type                     | trigger                                                       |
|--------------------------|---------------------------------------------------------------|
| `metric_change`          | event count deviates ≥ 20% from 7d avg                       |
| `new_event`              | event name not seen in prior 7 days                          |
| `retention_anomaly`      | week-1 retention drops > 20 pp vs previous week's cohort     |
| `conversion_correlation` | intermediate event has relative lift > 50% on conversion      |

### Constants (`src/constants.ts`)

- `INSIGHTS_INTERVAL_MS` — 24 hours
- `INSIGHTS_INITIAL_DELAY_MS` — 30 seconds
- `METRIC_CHANGE_THRESHOLD` — 0.20 (20%)
- `RETENTION_ANOMALY_THRESHOLD` — 0.20 (20 percentage points)
- `CONVERSION_CORRELATION_LIFT_THRESHOLD` — 0.5 (50% relative lift)
- `CONVERSION_CORRELATION_MIN_SAMPLE` — 30 (minimum users who performed intermediate event)

### ClickHouse Queries

`detectMetricChanges` uses two CTEs: `last_24h` (count per event, last day) and `last_7d` (avg daily count, days 2–7). The percentage change filter is applied in the outer `WHERE`. Only events with a 7-day baseline avg > 10 are considered to avoid noise from rare events.

`detectNewEvents` uses a `NOT IN` sub-query to exclude events seen in the prior 7 days. This is the correct ClickHouse pattern — do NOT rewrite as a LEFT JOIN + IS NULL check (LEFT JOIN returns default values, not NULL, for unmatched rows on non-Nullable columns).

`detectRetentionAnomalies` uses CTEs to compute week-1 retention for two consecutive cohort windows. Day-0 users are those who first appeared in the given 7-day window; "retained" users are those who returned in the 7-day window that follows 7 days after cohort entry. Uses INNER JOIN between cohort CTE and return-events CTE on `(event_name, distinct_id)` — ClickHouse does NOT support correlated subqueries (referencing outer CTE columns inside a subquery WHERE). The current cohort excludes users already seen in prev_cohort using tuple NOT IN — this prevents prev-retained users (whose return events share the `prev_return`/`current_cohort` time window) from inflating `current_cohort_size`.

`detectConversionCorrelations` uses a single query to compute correlations for all top-5 events at once. It uses 6 CTEs: `top_events` (top-5 by count), `conv_users` / `conv_counts` (per-conversion-event distinct users), `inter_users` / `inter_counts` (per-intermediate-event distinct users), `both_users` (INNER JOIN on distinct_id to count co-occurrences), and `total_users_agg` (scalar CROSS JOIN for base rate denominator). The outer SELECT joins these pre-aggregated CTEs and applies `LIMIT 3 BY conversion_event` to return the top-3 correlations per conversion event. This replaces the previous N+1 pattern (1 + 5 queries) with a single round trip to ClickHouse.

## Important: Do NOT Delete

- **`src/tracer.ts`** and the `dd-trace` dependency — Datadog APM, loaded via `-r` flag at runtime.
