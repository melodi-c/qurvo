import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import * as crypto from 'crypto';
import { UAParser } from 'ua-parser-js';
import { REDIS } from '../providers/redis.provider';
import { REDIS_STREAM_EVENTS, REDIS_STREAM_MAXLEN } from '../constants';
import type { TrackEvent } from '../schemas/event';

function resolveEventType(eventName: string): string {
  if (eventName === '$identify') return 'identify';
  if (eventName === '$pageview') return 'pageview';
  if (eventName === '$pageleave') return 'pageleave';
  if (eventName === '$set' || eventName === '$set_once') return 'set';
  if (eventName === '$screen') return 'screen';
  return 'track';
}

type ParsedUa = { browser: string; browser_version: string; os: string; os_version: string; device_type: string };

function parseUa(userAgent?: string): ParsedUa {
  if (!userAgent) return { browser: '', browser_version: '', os: '', os_version: '', device_type: '' };
  const result = new UAParser(userAgent).getResult();
  return {
    browser: result.browser.name ?? '',
    browser_version: result.browser.version ?? '',
    os: result.os.name ?? '',
    os_version: result.os.version ?? '',
    device_type: result.device.type ?? 'desktop',
  };
}

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async trackEvent(projectId: string, event: TrackEvent, ip?: string, userAgent?: string) {
    const serverTime = new Date().toISOString();
    const ua = parseUa(userAgent);
    const payload = this.buildPayload(projectId, event, serverTime, ip, ua);
    await this.redis.xadd(REDIS_STREAM_EVENTS, 'MAXLEN', '~', String(REDIS_STREAM_MAXLEN), '*', ...this.flattenObject(payload));
    this.logger.log({ projectId, eventName: event.event }, 'Event ingested');
  }

  async trackBatch(projectId: string, events: TrackEvent[], ip?: string, userAgent?: string) {
    const pipeline = this.redis.pipeline();
    const serverTime = new Date().toISOString();
    const batchId = crypto.randomUUID();
    const ua = parseUa(userAgent);

    for (const event of events) {
      const payload = this.buildPayload(projectId, event, serverTime, ip, ua, batchId);
      pipeline.xadd(REDIS_STREAM_EVENTS, 'MAXLEN', '~', String(REDIS_STREAM_MAXLEN), '*', ...this.flattenObject(payload));
    }

    const results = await pipeline.exec();
    if (results) {
      const failed = results.filter(([err]) => err !== null);
      if (failed.length > 0) {
        throw new Error(`${failed.length} of ${results.length} events failed to write to Redis stream`);
      }
    }
    this.logger.log({ projectId, eventCount: events.length, batchId }, 'Batch ingested');
  }

  private buildPayload(
    projectId: string,
    event: TrackEvent,
    serverTime: string,
    ip?: string,
    ua?: ParsedUa,
    batchId?: string,
  ): Record<string, string> {
    const resolvedUa: ParsedUa = ua ?? { browser: '', browser_version: '', os: '', os_version: '', device_type: '' };

    const payload: Record<string, string> = {
      event_id: crypto.randomUUID(),
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
      device_type: event.context?.device_type || resolvedUa.device_type,
      browser: event.context?.browser || resolvedUa.browser,
      browser_version: event.context?.browser_version || resolvedUa.browser_version,
      os: event.context?.os || resolvedUa.os,
      os_version: event.context?.os_version || resolvedUa.os_version,
      screen_width: String(event.context?.screen_width || 0),
      screen_height: String(event.context?.screen_height || 0),
      language: event.context?.language || '',
      timezone: event.context?.timezone || '',
      ip: ip || '',
      sdk_name: event.context?.sdk_name || '',
      sdk_version: event.context?.sdk_version || '',
      properties: JSON.stringify(event.properties || {}),
      user_properties: JSON.stringify(event.user_properties || {}),
      timestamp: this.clampTimestamp(event.timestamp, serverTime),
    };

    if (batchId) payload.batch_id = batchId;
    return payload;
  }

  private clampTimestamp(clientTs: string | undefined, serverTime: string): string {
    if (!clientTs) return serverTime;
    const drift = Math.abs(new Date(clientTs).getTime() - new Date(serverTime).getTime());
    if (drift > 3600_000) {
      this.logger.warn({ clientTs, serverTime, driftMs: drift }, 'Client clock drift too large, using server time');
      return serverTime;
    }
    return clientTs;
  }

  private flattenObject(obj: Record<string, string>): string[] {
    const result: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
      result.push(key, value);
    }
    return result;
  }
}
