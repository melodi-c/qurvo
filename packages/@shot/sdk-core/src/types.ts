export interface SdkConfig {
  apiKey: string;
  endpoint?: string;
  flushInterval?: number;
  flushSize?: number;
  maxQueueSize?: number;
}

export interface EventPayload {
  event: string;
  distinct_id: string;
  anonymous_id?: string;
  properties?: Record<string, unknown>;
  user_properties?: Record<string, unknown>;
  context?: EventContext;
  timestamp?: string;
}


export interface EventContext {
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
  language?: string;
  timezone?: string;
  sdk_name?: string;
  sdk_version?: string;
}

export interface SendOptions {
  keepalive?: boolean;
}

export interface Transport {
  send(endpoint: string, apiKey: string, payload: unknown, options?: SendOptions): Promise<boolean>;
}
