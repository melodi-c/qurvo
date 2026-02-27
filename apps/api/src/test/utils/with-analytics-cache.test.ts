import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withAnalyticsCache } from '../../analytics/with-analytics-cache';

function makeLogger() {
  return { debug: vi.fn(), error: vi.fn() } as any;
}

function makeRedis({ getResult, setResult }: { getResult?: string | null | Error; setResult?: Error } = {}) {
  return {
    get: vi.fn().mockImplementation(() => {
      if (getResult instanceof Error) return Promise.reject(getResult);
      return Promise.resolve(getResult ?? null);
    }),
    set: vi.fn().mockImplementation(() => {
      if (setResult instanceof Error) return Promise.reject(setResult);
      return Promise.resolve('OK');
    }),
  } as any;
}

function makeCh() {
  return {} as any;
}

describe('withAnalyticsCache', () => {
  const prefix = 'trend';
  const params = { project_id: 'proj-1', date_from: '2025-01-01', date_to: '2025-01-31' };
  const queryResult = [{ x: 1 }];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cached value when Redis has a hit', async () => {
    const cachedAt = '2025-01-31T12:00:00.000Z';
    const cached = JSON.stringify({ data: queryResult, cached_at: cachedAt });
    const redis = makeRedis({ getResult: cached });
    const query = vi.fn();
    const logger = makeLogger();

    const result = await withAnalyticsCache({ prefix, redis, ch: makeCh(), params, query, logger });

    expect(result).toEqual({ data: queryResult, cached_at: cachedAt, from_cache: true });
    expect(query).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('calls ClickHouse and writes to Redis on cache miss', async () => {
    const redis = makeRedis({ getResult: null });
    const query = vi.fn().mockResolvedValue(queryResult);
    const logger = makeLogger();

    const result = await withAnalyticsCache({ prefix, redis, ch: makeCh(), params, query, logger });

    expect(query).toHaveBeenCalledOnce();
    expect(redis.set).toHaveBeenCalledOnce();
    expect(result.data).toEqual(queryResult);
    expect(result.from_cache).toBe(false);
  });

  it('bypasses cache and always queries ClickHouse when force=true', async () => {
    const cachedAt = '2025-01-31T12:00:00.000Z';
    const cached = JSON.stringify({ data: [{ x: 99 }], cached_at: cachedAt });
    const redis = makeRedis({ getResult: cached });
    const query = vi.fn().mockResolvedValue(queryResult);
    const logger = makeLogger();

    const result = await withAnalyticsCache({ prefix, redis, ch: makeCh(), params, query, logger, force: true });

    expect(query).toHaveBeenCalledOnce();
    expect(result.data).toEqual(queryResult);
    expect(result.from_cache).toBe(false);
  });

  describe('graceful Redis degradation', () => {
    it('falls through to ClickHouse when Redis.get throws', async () => {
      const redis = makeRedis({ getResult: new Error('ECONNREFUSED') });
      const query = vi.fn().mockResolvedValue(queryResult);
      const logger = makeLogger();

      const result = await withAnalyticsCache({ prefix, redis, ch: makeCh(), params, query, logger });

      expect(query).toHaveBeenCalledOnce();
      expect(result.data).toEqual(queryResult);
      expect(result.from_cache).toBe(false);
      expect(logger.error).toHaveBeenCalledOnce();
      expect(logger.error.mock.calls[0][1]).toMatch(/Redis read error/);
    });

    it('returns ClickHouse data even when Redis.set throws', async () => {
      const redis = makeRedis({ getResult: null, setResult: new Error('write timeout') });
      const query = vi.fn().mockResolvedValue(queryResult);
      const logger = makeLogger();

      const result = await withAnalyticsCache({ prefix, redis, ch: makeCh(), params, query, logger });

      expect(result.data).toEqual(queryResult);
      expect(result.from_cache).toBe(false);
      expect(logger.error).toHaveBeenCalledOnce();
      expect(logger.error.mock.calls[0][1]).toMatch(/Redis write error/);
    });

    it('logs Redis read error before executing ClickHouse query', async () => {
      const redis = makeRedis({ getResult: new Error('timeout') });
      const query = vi.fn().mockResolvedValue(queryResult);
      const logger = makeLogger();

      await withAnalyticsCache({ prefix, redis, ch: makeCh(), params, query, logger });

      expect(logger.error).toHaveBeenCalledBefore(query as any);
    });

    it('does not propagate Redis.get error to the caller', async () => {
      const redis = makeRedis({ getResult: new Error('Redis gone') });
      const query = vi.fn().mockResolvedValue(queryResult);
      const logger = makeLogger();

      await expect(
        withAnalyticsCache({ prefix, redis, ch: makeCh(), params, query, logger }),
      ).resolves.not.toThrow();
    });

    it('does not propagate Redis.set error to the caller', async () => {
      const redis = makeRedis({ getResult: null, setResult: new Error('Redis gone') });
      const query = vi.fn().mockResolvedValue(queryResult);
      const logger = makeLogger();

      await expect(
        withAnalyticsCache({ prefix, redis, ch: makeCh(), params, query, logger }),
      ).resolves.not.toThrow();
    });
  });
});
