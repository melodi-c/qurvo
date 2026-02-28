import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { v7 as uuidv7 } from 'uuid';
import {
  REDIS,
  REDIS_STREAM_EVENTS,
  REDIS_STREAM_MAXLEN,
  STREAM_SCHEMA_VERSION,
  MAX_TIMESTAMP_DRIFT_MS,
  STREAM_BACKPRESSURE_THRESHOLD,
  BACKPRESSURE_CACHE_TTL_MS,
  billingCounterKey,
  billingCounterExpireAt,
  RATE_LIMIT_WINDOW_SECONDS,
  RATE_LIMIT_BUCKET_SECONDS,
  rateLimitBucketKey,
} from '../constants';
import { MetricsService } from '@qurvo/worker-core';
import type { TrackEvent } from '../schemas/event';
import type { ImportEvent } from '../schemas/import-event';

const EVENT_TYPE_MAP: Record<string, string> = {
  $identify: 'identify',
  $pageview: 'pageview',
  $pageleave: 'pageleave',
  $set: 'set',
  $set_once: 'set_once',
  $screen: 'screen',
};

function resolveEventType(eventName: string): string {
  return EVENT_TYPE_MAP[eventName] ?? 'track';
}

/**
 * PostHog-style timestamp resolution.
 * If sent_at is available: server_now - (sent_at - event_timestamp)
 * This corrects for client clock drift while preserving relative event ordering.
 * Falls back to server time if no client timestamps provided.
 */
export function resolveTimestamp(clientTs: string | undefined, serverTime: string, sentAt?: string): string {
  if (!clientTs || !sentAt) {return serverTime;}

  const clientTsMs = new Date(clientTs).getTime();
  const sentAtMs = new Date(sentAt).getTime();
  const serverMs = new Date(serverTime).getTime();

  const offsetMs = sentAtMs - clientTsMs;

  if (offsetMs < 0) {return serverTime;}
  if (offsetMs > MAX_TIMESTAMP_DRIFT_MS) {return serverTime;}

  const resolvedMs = serverMs - offsetMs;
  return new Date(resolvedMs).toISOString();
}

interface BuildPayloadOpts {
  batchId: string;
  ip?: string;
  userAgent?: string;
  sentAt?: string;
  event_id?: string;
}

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);
  private cachedStreamLen = 0;
  private cachedStreamLenAt = 0;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly metrics: MetricsService,
  ) {}

  async trackBatch(projectId: string, events: TrackEvent[], ip?: string, userAgent?: string, sentAt?: string) {
    const stopTimer = this.metrics.startTimer('ingest.batch_duration_ms');
    try {
      await this.checkBackpressure();
      const serverTime = new Date().toISOString();
      const batchId = uuidv7();
      const payloads = events.map((event) => this.buildPayload(projectId, event, serverTime, { ip, userAgent, batchId, sentAt, event_id: event.event_id }));
      await this.writeToStream(payloads);
      this.incrementCounters(projectId, events.length);
      this.metrics.increment('ingest.events_received_total', events.length);
      this.logger.log({ projectId, eventCount: events.length, batchId }, 'Batch ingested');
    } finally {
      stopTimer();
    }
  }

  async importBatch(projectId: string, events: ImportEvent[]) {
    await this.checkBackpressure();
    const batchId = `import-${uuidv7()}`;
    const payloads = events.map((event) =>
      this.buildPayload(projectId, event, event.timestamp, { batchId, event_id: event.event_id }),
    );
    await this.writeToStream(payloads);
    // Counters intentionally skipped: imports are rate-limited (RateLimitGuard reads
    // existing counters) but don't contribute to the rate-limit window — live traffic
    // takes priority. Billing is also skipped since imports are backfills, not new usage.
    this.logger.log({ projectId, eventCount: events.length, batchId }, 'Import batch ingested');
  }

  private buildPayload(
    projectId: string,
    event: TrackEvent,
    serverTime: string,
    opts: BuildPayloadOpts,
  ): Record<string, string> {
    const {
      session_id = '', url = '', referrer = '', page_title = '', page_path = '',
      device_type = '', browser = '', browser_version = '', os = '', os_version = '',
      screen_width = 0, screen_height = 0, language = '', timezone = '',
      sdk_name = '', sdk_version = '',
    } = event.context ?? {};

    return {
      schema_version: STREAM_SCHEMA_VERSION,
      event_id: opts.event_id || uuidv7(),
      project_id: projectId,
      event_name: event.event,
      event_type: resolveEventType(event.event),
      distinct_id: event.distinct_id,
      anonymous_id: event.anonymous_id || '',
      user_id: event.event === '$identify' ? event.distinct_id : '',
      session_id, url, referrer, page_title, page_path,
      device_type, browser, browser_version, os, os_version,
      screen_width: String(Math.max(0, screen_width)),
      screen_height: String(Math.max(0, screen_height)),
      language, timezone,
      ip: opts.ip || '',
      user_agent: opts.userAgent || '',
      sdk_name, sdk_version,
      properties: JSON.stringify(event.properties || {}),
      user_properties: JSON.stringify(event.user_properties || {}),
      batch_id: opts.batchId,
      timestamp: resolveTimestamp(event.timestamp, serverTime, opts.sentAt),
    };
  }

  private async checkBackpressure(): Promise<void> {
    const now = Date.now();
    if (now - this.cachedStreamLenAt < BACKPRESSURE_CACHE_TTL_MS) {
      if (this.cachedStreamLen >= STREAM_BACKPRESSURE_THRESHOLD) {
        this.metrics.increment('ingest.backpressure_rejected_total');
        throw new Error(`Redis stream at ${this.cachedStreamLen}/${REDIS_STREAM_MAXLEN} — processor may be behind`);
      }
      return;
    }

    const len = await this.redis.xlen(REDIS_STREAM_EVENTS);
    this.cachedStreamLen = len;
    this.cachedStreamLenAt = now;

    if (len >= STREAM_BACKPRESSURE_THRESHOLD) {
      this.metrics.increment('ingest.backpressure_rejected_total');
      this.logger.error({ streamLength: len, threshold: STREAM_BACKPRESSURE_THRESHOLD }, 'Redis stream backpressure — rejecting writes');
      throw new Error(`Redis stream at ${len}/${REDIS_STREAM_MAXLEN} — processor may be behind`);
    }
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
      const sampleErrors = failed.slice(0, 3).map(([err]) => String(err));
      this.logger.error({ failedCount: failed.length, totalCount: results.length, sampleErrors }, 'Partial Redis pipeline failure');
      throw new Error(`${failed.length} of ${results.length} events failed to write to Redis stream`);
    }
  }

  /** Fire-and-forget: billing + rate-limit counters in a single pipeline (1 Redis round-trip). */
  private incrementCounters(projectId: string, count: number): void {
    const billingKey = billingCounterKey(projectId);
    const rlKey = rateLimitBucketKey(projectId);
    const rlTtl = RATE_LIMIT_WINDOW_SECONDS + RATE_LIMIT_BUCKET_SECONDS;

    const pipeline = this.redis.pipeline();
    pipeline.incrby(billingKey, count);
    pipeline.expireat(billingKey, billingCounterExpireAt());
    pipeline.incrby(rlKey, count);
    pipeline.expire(rlKey, rlTtl);
    pipeline.exec().catch((err: unknown) =>
      this.logger.warn({ err, projectId }, 'Failed to increment counters'),
    );
  }

  reportDropped(reason: 'validation' | 'illegal_distinct_id', count: number): void {
    this.metrics.increment('ingest.events_dropped_total', count, { reason });
  }

  async isReady(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch {
      return false;
    }
  }

}
