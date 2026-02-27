// ── Heartbeat ─────────────────────────────────────────────────────────────────
export const HEARTBEAT_PATH = '/tmp/insights-worker.heartbeat';
export const HEARTBEAT_INTERVAL_MS = 15_000;
// insights cycle runs every 24h; allow up to 25h before considering the loop stale
export const HEARTBEAT_LOOP_STALE_MS = 25 * 60 * 60 * 1000;

// Run once every 24 hours
export const INSIGHTS_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Initial delay: 30 seconds after startup
export const INSIGHTS_INITIAL_DELAY_MS = 30_000;

// Threshold for metric change detection (20%)
export const METRIC_CHANGE_THRESHOLD = 0.20;

// Threshold for retention anomaly detection: >20% drop in week-1 retention rate
export const RETENTION_ANOMALY_THRESHOLD = 0.20;

// Threshold for conversion correlation: relative lift > 50%
export const CONVERSION_CORRELATION_LIFT_THRESHOLD = 0.5;

// Minimum sample size for conversion correlation insights
export const CONVERSION_CORRELATION_MIN_SAMPLE = 30;
