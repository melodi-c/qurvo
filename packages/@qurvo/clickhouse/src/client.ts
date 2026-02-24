import { createClient, ClickHouseClient } from '@clickhouse/client';

export interface ClickHouseConfig {
  url?: string;
  database?: string;
  username?: string;
  password?: string;
}

export function createClickHouse(config?: ClickHouseConfig): ClickHouseClient {
  return createClient({
    url: config?.url || process.env.CLICKHOUSE_URL || 'http://localhost:8123',
    database: config?.database || process.env.CLICKHOUSE_DB || 'qurvo_analytics',
    username: config?.username || process.env.CLICKHOUSE_USER || 'qurvo',
    password: config?.password || process.env.CLICKHOUSE_PASSWORD || 'qurvo_secret',
    clickhouse_settings: {
      async_insert: 1,
      wait_for_async_insert: 1,
      date_time_input_format: 'best_effort',
    },
  });
}

export type { ClickHouseClient };
