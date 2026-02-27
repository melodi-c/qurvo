import { createHash } from 'crypto';
import type { Logger } from '@nestjs/common';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import type Redis from 'ioredis';
import { ANALYTICS_CACHE_TTL_SECONDS } from '../constants';

/**
 * Produces a deterministic JSON string regardless of the insertion order of
 * object keys. Arrays preserve their element order (sorting arrays would change
 * semantics — e.g. funnel steps must stay in order). Only plain object keys are
 * sorted, recursively throughout the value tree.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const sorted = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => JSON.stringify(key) + ':' + stableStringify((value as Record<string, unknown>)[key]))
    .join(',');
  return '{' + sorted + '}';
}

export interface AnalyticsCacheResult<T> {
  data: T;
  cached_at: string;
  from_cache: boolean;
}

export async function withAnalyticsCache<TParams, TResult>(opts: {
  prefix: string;
  redis: Redis;
  ch: ClickHouseClient;
  widgetId?: string;
  force?: boolean;
  params: TParams;
  query: (ch: ClickHouseClient, params: TParams) => Promise<TResult>;
  logger: Logger;
}): Promise<AnalyticsCacheResult<TResult>> {
  const cacheKey = buildCacheKey(opts.prefix, opts.widgetId, opts.params);

  if (!opts.force) {
    try {
      const cached = await opts.redis.get(cacheKey);
      if (cached) {
        opts.logger.debug({ cacheKey, widgetId: opts.widgetId }, `${opts.prefix} cache hit`);
        const entry = JSON.parse(cached) as { data: TResult; cached_at: string };
        return { ...entry, from_cache: true };
      }
    } catch (err) {
      opts.logger.error({ err, cacheKey }, `${opts.prefix} Redis read error — falling back to ClickHouse`);
    }
  }

  opts.logger.debug({ force: opts.force }, `${opts.prefix} ClickHouse query`);

  const data = await opts.query(opts.ch, opts.params);
  const cached_at = new Date().toISOString();

  try {
    await opts.redis.set(cacheKey, JSON.stringify({ data, cached_at }), 'EX', ANALYTICS_CACHE_TTL_SECONDS);
  } catch (err) {
    opts.logger.error({ err, cacheKey }, `${opts.prefix} Redis write error — returning data without caching`);
  }

  return { data, cached_at, from_cache: false };
}

function buildCacheKey(prefix: string, widgetId: string | undefined, params: unknown): string {
  const configHash = createHash('sha256')
    .update(stableStringify(params))
    .digest('hex')
    .slice(0, 16);
  return widgetId
    ? `${prefix}_result:${widgetId}:${configHash}`
    : `${prefix}_result:anonymous:${configHash}`;
}
