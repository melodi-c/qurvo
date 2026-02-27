# Worker Core Package

Shared bootstrap utilities for all NestJS background workers in the monorepo.

## Exports

- `bootstrapWorker(options)` — creates a NestJS application context (no HTTP server), validates required env vars, enables shutdown hooks.
- `workerLoggerModule()` — returns a configured `LoggerModule` (Pino) for use in worker root modules.
- `MetricsService` — DogStatsD client wrapper (increment, gauge, timer). Injectable NestJS service.
- `PeriodicWorkerMixin` — abstract mixin for periodic background cycles (see below).
- `shutdownDb` / `shutdownClickHouse` / `shutdownRedis` — graceful connection teardown helpers used in `ShutdownService`.

## PeriodicWorkerMixin

Abstract base class for services that run a recurring cycle.

```ts
export abstract class PeriodicWorkerMixin implements OnApplicationBootstrap {
  protected abstract readonly intervalMs: number;
  protected abstract readonly initialDelayMs: number;
  protected abstract readonly logger: PinoLogger;

  abstract runCycle(): Promise<void>;

  // starts the first cycle after initialDelayMs
  onApplicationBootstrap(): void;

  // stops the timer and awaits any in-flight cycle; call from ShutdownService
  async stop(): Promise<void>;
}
```

Lifecycle:
1. On bootstrap: schedules first `runCycle()` after `initialDelayMs`.
2. After each cycle completes (or throws): schedules the next one after `intervalMs`.
3. On `stop()`: cancels the pending timer, waits for the in-flight cycle to finish.

The timer is `unref()`'d — it does not prevent the Node.js process from exiting on its own.

## Heartbeat

Workers write a heartbeat file every `HEARTBEAT_INTERVAL_MS` (15 seconds) as long as the main event loop is alive. Kubernetes liveness/readiness probes check the file's modification time.

`touch()` is called only in `runCycle()` start (or via a separate 15 s loop, depending on the worker). The important constraint is:

> **`HEARTBEAT_LOOP_STALE_MS` MUST be greater than `intervalMs`** (the cycle interval), otherwise the probe will fail between cycles.

Recommended formula: `HEARTBEAT_LOOP_STALE_MS = 2 * intervalMs`.

The K8s probe threshold (`AGE < N`) must also be aligned: use `N` slightly larger than `HEARTBEAT_LOOP_STALE_MS / 1000` (in seconds), with a small buffer for probe scheduling jitter.

## Template for a New Periodic Worker

### `src/constants.ts`

```ts
// ── <Worker> cycle ────────────────────────────────────────────────────────
export const MY_INTERVAL_MS = 60 * 60 * 1000; // e.g. 1 hour
export const MY_INITIAL_DELAY_MS = 30_000;    // 30s after startup

// ── Heartbeat ─────────────────────────────────────────────────────────────
export const HEARTBEAT_PATH = '/tmp/my-worker.heartbeat';
export const HEARTBEAT_INTERVAL_MS = 15_000;
// Must be > MY_INTERVAL_MS so the probe does not fire between idle cycles.
// Rule: HEARTBEAT_LOOP_STALE_MS = 2 * MY_INTERVAL_MS
export const HEARTBEAT_LOOP_STALE_MS = 2 * MY_INTERVAL_MS;
```

### K8s readiness/liveness probe (`deployment.yaml`)

```yaml
readinessProbe:
  exec:
    command:
      - /bin/sh
      - -c
      - |
        HEARTBEAT=/tmp/my-worker.heartbeat
        [ -f "$HEARTBEAT" ] || exit 1
        AGE=$(( $(date +%s) - $(date -r "$HEARTBEAT" +%s) ))
        [ "$AGE" -lt <STALE_SECONDS_WITH_BUFFER> ] || exit 1
  periodSeconds: 10
  failureThreshold: 3
livenessProbe:
  exec:
    command:
      - /bin/sh
      - -c
      - |
        HEARTBEAT=/tmp/my-worker.heartbeat
        [ -f "$HEARTBEAT" ] || exit 1
        AGE=$(( $(date +%s) - $(date -r "$HEARTBEAT" +%s) ))
        [ "$AGE" -lt <STALE_SECONDS_WITH_BUFFER> ] || exit 1
  initialDelaySeconds: 30
  periodSeconds: 20
  failureThreshold: 3
```

`STALE_SECONDS_WITH_BUFFER` = `HEARTBEAT_LOOP_STALE_MS / 1000 * 1.25` (25% buffer for probe jitter).

Examples:

| Worker interval | `HEARTBEAT_LOOP_STALE_MS` | Probe `AGE <` |
|---|---|---|
| 10 min | 1 200 000 ms (20 min) | 1800 s (30 min) |
| 1 hour | 7 200 000 ms (2 h) | 9000 s (2.5 h) |
| 24 hours | 90 000 000 ms (25 h) | 90000 s (~25 h) |

## Important: Do NOT Delete

- Each worker's `src/tracer.ts` and its `dd-trace` dependency — Datadog APM, loaded via `-r` flag at runtime.
