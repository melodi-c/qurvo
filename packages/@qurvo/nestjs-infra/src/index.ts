export { REDIS, RedisProvider } from './redis.provider';
export { CLICKHOUSE, ClickHouseProvider } from './clickhouse.provider';
export { DRIZZLE, DrizzleProvider } from './drizzle.provider';
export {
  BaseNotificationService,
  type SlackChannelConfig,
  type EmailChannelConfig,
} from './notification/notification.service';

// ── Shared stream constants (used by both ingest and processor) ─────────────
export const REDIS_STREAM_EVENTS = 'events:incoming';
