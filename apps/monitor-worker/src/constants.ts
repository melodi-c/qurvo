// ── Monitor check (periodic anomaly detection) ───────────────────────────────
export const MONITOR_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
export const MONITOR_INITIAL_DELAY_MS = 30_000; // 30s

// ── Heartbeat ─────────────────────────────────────────────────────────────
export const HEARTBEAT_PATH = '/tmp/monitor-worker.heartbeat';
export const HEARTBEAT_INTERVAL_MS = 15_000;
// Cycle runs every 1h; allow up to 2h before considering the loop stale
export const HEARTBEAT_LOOP_STALE_MS = 2 * MONITOR_CHECK_INTERVAL_MS; // 7_200_000
