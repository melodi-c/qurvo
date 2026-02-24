import { createHash } from 'crypto';
import type { Logger } from '@nestjs/common';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import type Redis from 'ioredis';
import { ANALYTICS_CACHE_TTL_SECONDS } from '../constants';

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
    const cached = await opts.redis.get(cacheKey);
    if (cached) {
      opts.logger.debug({ cacheKey, widgetId: opts.widgetId }, `${opts.prefix} cache hit`);
      const entry = JSON.parse(cached) as { data: TResult; cached_at: string };
      return { ...entry, from_cache: true };
    }
  }

  opts.logger.debug({ force: opts.force }, `${opts.prefix} ClickHouse query`);

  const data = await opts.query(opts.ch, opts.params);
  const cached_at = new Date().toISOString();

  await opts.redis.set(cacheKey, JSON.stringify({ data, cached_at }), 'EX', ANALYTICS_CACHE_TTL_SECONDS);

  return { data, cached_at, from_cache: false };
}

function buildCacheKey(prefix: string, widgetId: string | undefined, params: unknown): string {
  const configHash = createHash('sha256')
    .update(JSON.stringify(params))
    .digest('hex')
    .slice(0, 16);
  return widgetId
    ? `${prefix}_result:${widgetId}:${configHash}`
    : `${prefix}_result:anonymous:${configHash}`;
}
