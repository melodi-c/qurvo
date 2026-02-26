# Scheduled Jobs Worker App

NestJS background worker. No HTTP server. Periodically evaluates active AI scheduled jobs, executes their prompts via OpenAI, and delivers results over Slack or email.

## Commands

```bash
pnpm --filter @qurvo/scheduled-jobs-worker dev          # watch mode
pnpm --filter @qurvo/scheduled-jobs-worker build        # nest build → dist/
pnpm --filter @qurvo/scheduled-jobs-worker start        # node dist/main.js
```

## Architecture

```
src/
├── app.module.ts                               # Root: workerLoggerModule() + ScheduledJobsModule
├── main.ts                                     # bootstrapWorker() from @qurvo/worker-core (env validation, no HTTP)
├── tracer.ts                                   # Datadog APM init (imported first in main.ts)
├── scheduled-jobs/
│   ├── scheduled-jobs.module.ts                # DrizzleProvider + services (no ClickHouse)
│   ├── scheduled-jobs.service.ts               # Periodic cycle: due-check → OpenAI call → notify → update last_run_at
│   ├── notification.service.ts                 # Result dispatch: Slack webhook or email via BaseNotificationService
│   ├── shutdown.service.ts                     # Graceful shutdown: stops service, closes PG pool
│   └── scheduled-jobs.service.unit.test.ts    # Pure unit tests for isDue scheduling logic
```

## How It Works

Every hour (initial delay: 60s after startup):
1. Load all active jobs from `ai_scheduled_jobs` (PostgreSQL, `is_active = true`).
2. For each job, call `isDue(job, now)` to determine if it is time to run.
3. If due, call OpenAI Chat Completions API with the job's `prompt`.
4. Send the AI response via the configured notification channel (Slack or email).
5. Update `last_run_at` and `updated_at` in PostgreSQL.

If `OPENAI_API_KEY` is not set, the worker starts but skips all AI calls and logs a warning per job.

### Scheduling Logic (`isDue`)

| schedule  | fires when                                                     |
|-----------|----------------------------------------------------------------|
| `daily`   | `now - last_run_at >= 24h`                                     |
| `weekly`  | `now - last_run_at >= 7 days`                                  |
| `monthly` | `now >= last_run_at + 1 calendar month` (JS `Date.setMonth`)  |
| _(null)_  | always fires (never ran before)                                |

Monthly scheduling uses `Date.setMonth(+1)`, not a fixed 30-day offset. JS overflow applies: Jan 31 + 1 month = Mar 3 (Feb 31 overflows). This is intentional and tested.

### Environment Variables

| variable          | purpose                                          | default        |
|-------------------|--------------------------------------------------|----------------|
| `OPENAI_API_KEY`  | Required for AI calls; if absent, jobs are skipped | —            |
| `OPENAI_MODEL`    | Model to use for chat completions                | `gpt-4o-mini`  |
| `OPENAI_BASE_URL` | Optional custom base URL (e.g. Azure proxy)      | OpenAI default |

### Notification Channels

`NotificationService` extends `BaseNotificationService` from `@qurvo/nestjs-infra`.

| `channel_type` | delivery                         |
|----------------|----------------------------------|
| `slack`        | Webhook POST via `SlackChannelConfig` |
| `email`        | SMTP via `EmailChannelConfig`    |

`channel_config` is stored as a JSON string in `ai_scheduled_jobs.channel_config` and parsed at runtime. A parse failure is logged as a warning; the job still attempts notification with an empty config.

## Unit Tests

`src/scheduled-jobs/scheduled-jobs.service.unit.test.ts` — 11 tests covering `isDue`:
- Never-ran jobs always fire
- Daily: boundary at exactly 24h
- Weekly: boundary at exactly 7 days
- Monthly: calendar-month boundary (not 30-day approximation)
- February and January edge cases
- JS `setMonth` end-of-month overflow
- Unknown schedule returns false

```bash
pnpm --filter @qurvo/scheduled-jobs-worker exec vitest run
```

## Important: Do NOT Delete

- **`src/tracer.ts`** and the `dd-trace` dependency — Datadog APM, loaded via `-r` flag at runtime.
