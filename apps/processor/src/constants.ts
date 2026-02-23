// NOTE: must match apps/ingest/src/constants.ts
export const REDIS_STREAM_EVENTS = 'events:incoming';
export const REDIS_STREAM_DLQ = 'events:dlq';
export const REDIS_CONSUMER_GROUP = 'processor-group';

export const PROCESSOR_BATCH_SIZE = 1000;
export const PROCESSOR_FLUSH_INTERVAL_MS = Number(process.env.PROCESSOR_FLUSH_INTERVAL_MS) || 5000;
export const PROCESSOR_MAX_RETRIES = 3;

export const PENDING_CLAIM_INTERVAL_MS = 30_000;
export const PENDING_IDLE_MS = 60_000;

export const DLQ_REPLAY_INTERVAL_MS = 5 * 60_000;
export const DLQ_REPLAY_BATCH = 100;
export const DLQ_CIRCUIT_BREAKER_THRESHOLD = 5;
export const DLQ_CIRCUIT_BREAKER_RESET_MS = 5 * 60_000;

export const REDIS_DLQ_MAXLEN = 100_000;

export const PERSON_REDIS_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

export const COHORT_MEMBERSHIP_INTERVAL_MS = 10 * 60_000; // 10 minutes
export const COHORT_STALE_THRESHOLD_MINUTES = 15;
export const COHORT_ERROR_BACKOFF_BASE_MINUTES = 30;
export const COHORT_ERROR_BACKOFF_MAX_EXPONENT = 10; // cap: ~21 days
