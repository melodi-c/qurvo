import { gzipSync } from 'node:zlib';
import { EventQueue, FetchTransport } from '@qurvo/sdk-core';
import type { SdkConfig, EventPayload } from '@qurvo/sdk-core';
import { SDK_VERSION } from './version';

const SDK_NAME = '@qurvo/sdk-node';

export interface NodeSdkConfig extends SdkConfig {
  endpoint?: string;
}

export class Qurvo {
  private queue: EventQueue;
  private config: NodeSdkConfig;

  constructor(config: NodeSdkConfig) {
    this.config = config;
    const endpoint = config.endpoint || 'http://localhost:3001';
    const transport = new FetchTransport(async (data) => new Blob([gzipSync(data)]));
    this.queue = new EventQueue(
      transport,
      `${endpoint}/v1/batch`,
      config.apiKey,
      config.flushInterval || 5000,
      config.flushSize || 20,
      config.maxQueueSize || 1000,
      30_000,
      config.logger,
    );
    this.queue.start();
  }

  track(params: { distinct_id: string; event: string; properties?: Record<string, unknown> }) {
    const payload: EventPayload = {
      event: params.event,
      distinct_id: params.distinct_id,
      properties: params.properties,
      context: {
        sdk_name: SDK_NAME,
        sdk_version: SDK_VERSION,
      },
      timestamp: new Date().toISOString(),
    };
    this.queue.enqueue(payload);
  }

  identify(params: { distinct_id: string; user_properties: Record<string, unknown> }) {
    const payload: EventPayload = {
      event: '$identify',
      distinct_id: params.distinct_id,
      user_properties: params.user_properties,
      context: {
        sdk_name: SDK_NAME,
        sdk_version: SDK_VERSION,
      },
      timestamp: new Date().toISOString(),
    };
    this.queue.enqueue(payload);
  }

  set(params: { distinct_id: string; properties: Record<string, unknown> }) {
    const payload: EventPayload = {
      event: '$set',
      distinct_id: params.distinct_id,
      user_properties: { $set: params.properties },
      context: {
        sdk_name: SDK_NAME,
        sdk_version: SDK_VERSION,
      },
      timestamp: new Date().toISOString(),
    };
    this.queue.enqueue(payload);
  }

  setOnce(params: { distinct_id: string; properties: Record<string, unknown> }) {
    const payload: EventPayload = {
      event: '$set_once',
      distinct_id: params.distinct_id,
      user_properties: { $set_once: params.properties },
      context: {
        sdk_name: SDK_NAME,
        sdk_version: SDK_VERSION,
      },
      timestamp: new Date().toISOString(),
    };
    this.queue.enqueue(payload);
  }

  screen(params: { distinct_id: string; screen_name: string; properties?: Record<string, unknown> }) {
    const payload: EventPayload = {
      event: '$screen',
      distinct_id: params.distinct_id,
      properties: { $screen_name: params.screen_name, ...params.properties },
      context: {
        sdk_name: SDK_NAME,
        sdk_version: SDK_VERSION,
      },
      timestamp: new Date().toISOString(),
    };
    this.queue.enqueue(payload);
  }

  async shutdown(timeoutMs?: number) {
    await this.queue.shutdown(timeoutMs);
  }
}
