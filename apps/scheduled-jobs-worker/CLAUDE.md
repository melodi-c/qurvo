# Scheduled Jobs Worker App

NestJS background worker. No HTTP server. Periodically evaluates active AI scheduled jobs, calls the internal Qurvo API (AI chat with analytics tools), and delivers results over Slack, email, or Telegram.

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
│   ├── scheduled-jobs.service.ts               # Periodic cycle: due-check → AI runner → notify → update last_run_at
│   ├── ai-runner.service.ts                    # Calls POST /api/ai/chat (SSE), collects assistant text
│   ├── notification.service.ts                 # Result dispatch: Slack webhook or email via BaseNotificationService
│   ├── shutdown.service.ts                     # Graceful shutdown: stops service, closes PG pool
│   └── scheduled-jobs.service.unit.test.ts    # Pure unit tests for isDue scheduling logic
```

## How It Works

Every hour (initial delay: 60s after startup):
1. Load all active jobs from `ai_scheduled_jobs` (PostgreSQL, `is_active = true`).
2. For each job, call `isDue(job, now)` to determine if it is time to run.
3. If due, call `AiRunnerService.runPrompt(projectId, prompt)` — sends the prompt to the internal API (`POST /api/ai/chat`) and streams the SSE response, collecting the final assistant text. The AI has access to all analytics tools (ClickHouse event data, cohorts, trends, etc.).
4. Send the AI response via the configured notification channel (Slack, email, or Telegram).
5. Update `last_run_at` and `updated_at` in PostgreSQL.

If `INTERNAL_API_URL` or `INTERNAL_API_TOKEN` is not set, the worker starts but skips all AI calls and logs a warning per job.

### AI Runner (`AiRunnerService`)

Calls `POST /api/ai/chat` with `Bearer ${INTERNAL_API_TOKEN}`. This endpoint accepts `{ project_id, message }` and streams an SSE response. The runner:
- Collects `text_delta` chunks into the final assistant text
- Handles `error` events by throwing
- Ignores `conversation`, `tool_call_start`, `tool_result`, `done` events
- Returns `'(no response)'` if the stream produces no text

The bearer token must be a valid, non-expired session token for a user who has access to the project. Token is stored as `INTERNAL_API_TOKEN` secret.

### Scheduling Logic (`isDue`)

| schedule  | fires when                                                     |
|-----------|----------------------------------------------------------------|
| `daily`   | `now - last_run_at >= 24h`                                     |
| `weekly`  | `now - last_run_at >= 7 days`                                  |
| `monthly` | `now >= last_run_at + 1 calendar month` (JS `Date.setMonth`)  |
| _(null)_  | always fires (never ran before)                                |

Monthly scheduling uses `Date.setMonth(+1)`, not a fixed 30-day offset. JS overflow applies: Jan 31 + 1 month = Mar 3 (Feb 31 overflows). This is intentional and tested.

### Environment Variables

| variable              | purpose                                                           | default |
|-----------------------|-------------------------------------------------------------------|---------|
| `INTERNAL_API_URL`    | Base URL of the internal Qurvo API (e.g. `http://qurvo-api:3000`) | —       |
| `INTERNAL_API_TOKEN`  | Bearer token for auth (valid session token for a project member)  | —       |

Both must be set for AI calls. If either is absent, jobs are skipped with a warning.

### Notification Channels

`NotificationService` extends `BaseNotificationService` from `@qurvo/nestjs-infra`.

| `channel_type` | delivery                         |
|----------------|----------------------------------|
| `slack`        | Webhook POST via `SlackChannelConfig` |
| `email`        | SMTP via `EmailChannelConfig`    |
| `telegram`     | Bot API POST via `TelegramChannelConfig` (`chat_id` + `bot_token`) |

`channel_config` is stored as a `jsonb` column in `ai_scheduled_jobs.channel_config` (same as `ai_monitors`). Drizzle ORM returns it already as `Record<string, unknown>` — no manual `JSON.parse` needed at runtime.

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
pnpm --filter @qurvo/scheduled-jobs-worker exec vitest run --config vitest.unit.config.ts
```

## Important: Do NOT Delete

- **`src/tracer.ts`** and the `dd-trace` dependency — Datadog APM, loaded via `-r` flag at runtime.
