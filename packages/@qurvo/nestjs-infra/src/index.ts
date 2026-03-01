export { REDIS, RedisProvider } from './redis.provider';
export { CLICKHOUSE, ClickHouseProvider } from './clickhouse.provider';
export { DRIZZLE, DrizzleProvider } from './drizzle.provider';
export {
  BaseNotificationService,
  isSlackConfig,
  isEmailConfig,
  isTelegramConfig,
  type SlackChannelConfig,
  type EmailChannelConfig,
  type TelegramChannelConfig,
} from './notification/notification.service';

// Shared stream constants (used by both ingest and processor)
export const REDIS_STREAM_EVENTS = 'events:incoming';

// Shared Redis key builders (single source of truth across apps)
export const REDIS_KEY = {
  /** Cache key for event names list for a project. Written by API, invalidated by processor. */
  eventNames: (projectId: string) => `event_names:${projectId}`,
  /** Cache key for event property names for a project. Invalidated by processor. */
  eventPropertyNames: (projectId: string) => `event_property_names:${projectId}`,
  /** Cache key for project auth token lookup. Written/read by ingest, invalidated by API. */
  projectToken: (token: string) => `project_token:${token}`,
} as const;
