export interface SdkConfig {
  apiKey: string;
  endpoint?: string;
  flushInterval?: number;
  flushSize?: number;
  maxQueueSize?: number;
  logger?: LogFn;
}

export interface EventPayload {
  event: string;
  distinct_id: string;
  anonymous_id?: string;
  properties?: Record<string, unknown>;
  user_properties?: Record<string, unknown>;
  context?: EventContext;
  timestamp?: string;
  event_id?: string;
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
  signal?: AbortSignal;
}

export type LogFn = (message: string, error?: unknown) => void;

export type CompressFn = (data: string) => Promise<Blob>;

export interface Transport {
  send(endpoint: string, apiKey: string, payload: unknown, options?: SendOptions): Promise<boolean>;
}

export class QuotaExceededError extends Error {
  constructor() {
    super('Monthly event limit exceeded');
    this.name = 'QuotaExceededError';
  }
}

/** Non-retryable error (4xx). SDK should drop the batch, not retry. */
export class NonRetryableError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}
