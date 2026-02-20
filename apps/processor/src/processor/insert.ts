import type { ClickHouseClient, Event } from '@qurvo/clickhouse';

export async function insertEvents(ch: ClickHouseClient, events: Event[]) {
  await ch.insert({
    table: 'events',
    values: events,
    format: 'JSONEachRow',
    clickhouse_settings: {
      date_time_input_format: 'best_effort',
    },
  });
}
