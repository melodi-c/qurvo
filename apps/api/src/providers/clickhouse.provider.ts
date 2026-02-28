import type { Provider } from '@nestjs/common';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { createClickHouse } from '@qurvo/clickhouse';

export const CLICKHOUSE = Symbol('CLICKHOUSE');

export const ClickHouseProvider: Provider<ClickHouseClient> = {
  provide: CLICKHOUSE,
  useFactory: () => {
    if (process.env.NODE_ENV === 'production' && !process.env.CLICKHOUSE_URL) {
      throw new Error('CLICKHOUSE_URL environment variable is required in production');
    }
    return createClickHouse({
      url: process.env.CLICKHOUSE_URL,
      database: process.env.CLICKHOUSE_DB,
      username: process.env.CLICKHOUSE_USER,
      password: process.env.CLICKHOUSE_PASSWORD,
    });
  },
};
