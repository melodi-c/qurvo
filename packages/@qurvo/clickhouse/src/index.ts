export { createClickHouse } from './client';
export type { ClickHouseConfig, ClickHouseClient } from './client';

/** Represents a row in the events table. Optional fields have ClickHouse DEFAULT values. */
export interface Event {
  event_id: string;
  project_id: string;
  event_name: string;
  event_type: string;
  distinct_id: string;
  anonymous_id?: string;
  user_id?: string;
  person_id: string;
  session_id?: string;
  url?: string;
  referrer?: string;
  page_title?: string;
  page_path?: string;
  device_type?: string;
  browser?: string;
  browser_version?: string;
  os?: string;
  os_version?: string;
  screen_width?: number;
  screen_height?: number;
  country?: string;
  region?: string;
  city?: string;
  language?: string;
  timezone?: string;
  properties?: string;
  user_properties?: string;
  sdk_name?: string;
  sdk_version?: string;
  timestamp: string;
  ingested_at?: string;
  batch_id?: string;
  ip?: string;
}
