import { Provider } from '@nestjs/common';
import { createClickHouse, type ClickHouseClient } from '@qurvo/clickhouse';

export const CLICKHOUSE = Symbol('CLICKHOUSE');

export const ClickHouseProvider: Provider<ClickHouseClient> = {
  provide: CLICKHOUSE,
  useFactory: () => {
    return createClickHouse();
  },
};
