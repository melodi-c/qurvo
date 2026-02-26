// ── Stream / Consumer ────────────────────────────────────────────────────────
export { REDIS_STREAM_EVENTS } from '@qurvo/nestjs-infra';
export const REDIS_CONSUMER_GROUP = 'processor-group';
export const PENDING_CLAIM_INTERVAL_MS = 30_000;
export const PENDING_IDLE_MS = 60_000;
export const MAX_CONSECUTIVE_ERRORS = 100;
export const XREAD_COUNT = 100;
export const XREAD_BLOCK_MS = 2000;
export const ERROR_RETRY_DELAY_MS = 1_000;

// ── Flush / Batch ────────────────────────────────────────────────────────────
export const PROCESSOR_BATCH_SIZE = 1000;
export const PROCESSOR_BACKPRESSURE_THRESHOLD = PROCESSOR_BATCH_SIZE * 2;
export const PROCESSOR_FLUSH_INTERVAL_MS = Number(process.env.PROCESSOR_FLUSH_INTERVAL_MS) || 5000;
export const BACKPRESSURE_DRAIN_DELAY_MS = 500;

// ── DLQ ──────────────────────────────────────────────────────────────────────
export const REDIS_STREAM_DLQ = 'events:dlq';
export const REDIS_DLQ_MAXLEN = 100_000;
export const DLQ_REPLAY_INTERVAL_MS = 5 * 60_000;
export const DLQ_REPLAY_BATCH = 100;
export const DLQ_CIRCUIT_BREAKER_THRESHOLD = 5;
export const DLQ_CIRCUIT_BREAKER_RESET_MS = 5 * 60_000;
export const DLQ_FAILURES_KEY = 'dlq:replay:failures';
export const DLQ_CIRCUIT_KEY = 'dlq:replay:circuit';

// ── Person ───────────────────────────────────────────────────────────────────
export const PERSON_REDIS_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

// ── Failed merge persistence ─────────────────────────────────────────────────
export const FAILED_MERGES_KEY = 'processor:failed_merges';
export const FAILED_MERGES_MAXLEN = 1000;
export const FAILED_MERGES_REPLAY_BATCH = 10;

// ── Warnings buffer ───────────────────────────────────────────────────────────
export const WARNINGS_BATCH_SIZE = 100;
export const WARNINGS_FLUSH_INTERVAL_MS = 10_000;

// ── GeoIP ─────────────────────────────────────────────────────────────────────
export const GEO_DOWNLOAD_MAX_ATTEMPTS = 3;
export const GEO_DOWNLOAD_TIMEOUT_MS = 10_000;
export const GEO_DOWNLOAD_RETRY_DELAY_MS = 2_000;
export const MMDB_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// ── Heartbeat ──────────────────────────────────────────────────────────────
export const HEARTBEAT_PATH = '/tmp/processor.heartbeat';
export const HEARTBEAT_INTERVAL_MS = 15_000;
export const HEARTBEAT_LOOP_STALE_MS = 30_000;

// ── Retry presets ─────────────────────────────────────────────────────────
export const RETRY_CLICKHOUSE = { maxAttempts: 3, baseDelayMs: 1000 } as const;
export const RETRY_POSTGRES = { maxAttempts: 3, baseDelayMs: 200 } as const;
export const RETRY_DEFINITIONS = { maxAttempts: 3, baseDelayMs: 50 } as const;
