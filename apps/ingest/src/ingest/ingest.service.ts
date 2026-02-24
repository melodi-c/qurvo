import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { v7 as uuidv7 } from 'uuid';
import { UAParser } from 'ua-parser-js';
import { REDIS, REDIS_STREAM_EVENTS, REDIS_STREAM_MAXLEN, BILLING_EVENTS_TTL_SECONDS, billingCounterKey } from '../constants';
import type { TrackEvent } from '../schemas/event';
import type { ImportEvent } from '../schemas/import-event';

const EVENT_TYPE_MAP: Record<string, string> = {
  $identify: 'identify',
  $pageview: 'pageview',
  $pageleave: 'pageleave',
  $set: 'set',
  $set_once: 'set',
  $screen: 'screen',
};

function resolveEventType(eventName: string): string {
  return EVENT_TYPE_MAP[eventName] ?? 'track';
}

type ParsedUa = { browser: string; browser_version: string; os: string; os_version: string; device_type: string };

const EMPTY_UA: ParsedUa = { browser: '', browser_version: '', os: '', os_version: '', device_type: '' };

function parseUa(userAgent?: string): ParsedUa {
  if (!userAgent) return EMPTY_UA;
  const result = new UAParser(userAgent).getResult();
  return {
    browser: result.browser.name ?? '',
    browser_version: result.browser.version ?? '',
    os: result.os.name ?? '',
    os_version: result.os.version ?? '',
    device_type: result.device.type ?? 'desktop',
  };
}

/**
 * PostHog-style timestamp resolution.
 * If sent_at is available: server_now - (sent_at - event_timestamp)
 * This corrects for client clock drift while preserving relative event ordering.
 * Falls back to server time if no client timestamps provided.
 */
export function resolveTimestamp(clientTs: string | undefined, serverTime: string, sentAt?: string): string {
  if (!clientTs || !sentAt) return serverTime;

  const clientTsMs = new Date(clientTs).getTime();
  const sentAtMs = new Date(sentAt).getTime();
  const serverMs = new Date(serverTime).getTime();

  const offsetMs = sentAtMs - clientTsMs;

  if (offsetMs < 0) return serverTime;

  const resolvedMs = serverMs - offsetMs;
  return new Date(resolvedMs).toISOString();
}

interface BuildPayloadOpts {
  batchId: string;
  ip?: string;
  ua?: ParsedUa;
  sentAt?: string;
  event_id?: string;
}

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async trackBatch(projectId: string, events: TrackEvent[], ip?: string, userAgent?: string, sentAt?: string) {
    const serverTime = new Date().toISOString();
    const batchId = uuidv7();
    const ua = parseUa(userAgent);
    const payloads = events.map((event) => this.buildPayload(projectId, event, serverTime, { ip, ua, batchId, sentAt }));
    await this.writeToStream(payloads);
    this.incrementBillingCounter(projectId, events.length);
    this.logger.log({ projectId, eventCount: events.length, batchId }, 'Batch ingested');
  }

  async importBatch(projectId: string, events: ImportEvent[]) {
    const batchId = `import-${uuidv7()}`;
    const payloads = events.map((event) =>
      this.buildPayload(projectId, event, event.timestamp, { batchId, event_id: event.event_id }),
    );
    await this.writeToStream(payloads);
    // Billing intentionally skipped for imports
    this.logger.log({ projectId, eventCount: events.length, batchId }, 'Import batch ingested');
  }

  private buildPayload(
    projectId: string,
    event: TrackEvent,
    serverTime: string,
    opts: BuildPayloadOpts,
  ): Record<string, string> {
    const ua = opts.ua ?? EMPTY_UA;

    const payload: Record<string, string> = {
      event_id: opts.event_id || uuidv7(),
      project_id: projectId,
      event_name: event.event,
      event_type: resolveEventType(event.event),
      distinct_id: event.distinct_id,
      anonymous_id: event.anonymous_id || '',
      user_id: event.event === '$identify' ? event.distinct_id : '',
      session_id: event.context?.session_id || '',
      url: event.context?.url || '',
      referrer: event.context?.referrer || '',
      page_title: event.context?.page_title || '',
      page_path: event.context?.page_path || '',
      device_type: event.context?.device_type || ua.device_type,
      browser: event.context?.browser || ua.browser,
      browser_version: event.context?.browser_version || ua.browser_version,
      os: event.context?.os || ua.os,
      os_version: event.context?.os_version || ua.os_version,
      screen_width: String(Math.max(0, event.context?.screen_width || 0)),
      screen_height: String(Math.max(0, event.context?.screen_height || 0)),
      language: event.context?.language || '',
      timezone: event.context?.timezone || '',
      ip: opts.ip || '',
      sdk_name: event.context?.sdk_name || '',
      sdk_version: event.context?.sdk_version || '',
      properties: JSON.stringify(event.properties || {}),
      user_properties: JSON.stringify(event.user_properties || {}),
      batch_id: opts.batchId,
      timestamp: resolveTimestamp(event.timestamp, serverTime, opts.sentAt),
    };

    return payload;
  }

  private async writeToStream(payloads: Record<string, string>[]): Promise<void> {
    const pipeline = this.redis.pipeline();
    for (const payload of payloads) {
      pipeline.xadd(REDIS_STREAM_EVENTS, 'MAXLEN', '~', String(REDIS_STREAM_MAXLEN), '*', ...Object.entries(payload).flat());
    }
    const results = await pipeline.exec();
    if (!results) {
      throw new Error('Redis pipeline returned null — connection lost');
    }
    const failed = results.filter(([err]) => err !== null);
    if (failed.length > 0) {
      throw new Error(`${failed.length} of ${results.length} events failed to write to Redis stream`);
    }
  }

  private incrementBillingCounter(projectId: string, count: number): void {
    const counterKey = billingCounterKey(projectId);

    const pipeline = this.redis.pipeline();
    pipeline.incrby(counterKey, count);
    pipeline.expire(counterKey, BILLING_EVENTS_TTL_SECONDS);
    pipeline.exec().catch((err: unknown) =>
      this.logger.warn({ err, projectId }, 'Failed to increment billing counter'),
    );
  }

}
