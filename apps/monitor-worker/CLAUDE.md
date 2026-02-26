# Monitor Worker App

NestJS background worker. No HTTP server. Periodically evaluates active user-configured monitors for statistical anomalies using a z-score model, then dispatches Slack or email alerts when the threshold is exceeded.

## Commands

```bash
pnpm --filter @qurvo/monitor-worker dev          # watch mode
pnpm --filter @qurvo/monitor-worker build        # nest build → dist/
pnpm --filter @qurvo/monitor-worker start        # node dist/main.js
```

## Architecture

```
src/
├── app.module.ts                            # Root: workerLoggerModule() + MonitorModule
├── main.ts                                  # bootstrapWorker() from @qurvo/worker-core (env validation, no HTTP)
├── constants.ts                             # Check interval (1h), initial delay (30s)
├── tracer.ts                                # Datadog APM init (imported first in main.ts)
├── monitor/
│   ├── monitor.module.ts                    # DrizzleProvider + ClickHouseProvider + services
│   ├── monitor.service.ts                   # Periodic cycle: z-score anomaly detection per active monitor
│   ├── notification.service.ts              # Alert dispatch: Slack webhook or email via BaseNotificationService
│   └── shutdown.service.ts                  # Graceful shutdown: stops service, closes PG pool
```

## How It Works

Every hour (initial delay: 30s after startup):
1. Load all active monitors from `ai_monitors` (PostgreSQL, `is_active = true`).
2. For each monitor, compute baseline statistics from ClickHouse (last 29 days).
3. Calculate z-score: `|current - baseline_avg| / baseline_std`.
4. If `z_score >= monitor.threshold_sigma`, generate a description and send an alert.

A monitor with `baseline_avg = 0` (no data) is skipped silently. If `baseline_std = 0` (constant signal), the denominator is treated as 1 to avoid division by zero.

### Z-Score Model

```
baseline_avg = avg daily value over days [2, 29] (prior to today)
baseline_std = stddev over the same window
current      = today's value so far
z_score      = |current - baseline_avg| / max(baseline_std, 1)
```

The ClickHouse query runs in a single pass using conditional aggregation (`avgIf`, `stddevPopIf`, `sumIf`) over a 29-day window, bucketed by `toDate(timestamp)`.

### Supported Metrics

| metric         | ClickHouse expression      |
|----------------|----------------------------|
| `event_count`  | `count()`                  |
| `unique_users` | `uniqExact(person_id)`     |

### Notification Channels

`NotificationService` extends `BaseNotificationService` from `@qurvo/nestjs-infra`.

| `channel_type` | delivery                        |
|----------------|---------------------------------|
| `slack`        | Webhook POST via `SlackChannelConfig` |
| `email`        | SMTP via `EmailChannelConfig`   |

Alert message includes: event name, metric, current value, baseline avg, percentage change, and z-score.

### Constants (`src/constants.ts`)

- `MONITOR_CHECK_INTERVAL_MS` — 1 hour (3 600 000 ms)
- `MONITOR_INITIAL_DELAY_MS` — 30 seconds

## Important: Do NOT Delete

- **`src/tracer.ts`** and the `dd-trace` dependency — Datadog APM, loaded via `-r` flag at runtime.
