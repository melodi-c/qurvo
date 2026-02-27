import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withAnalyticsCache, stableStringify } from '../../analytics/with-analytics-cache';

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

describe('stableStringify', () => {
  it('produces the same output regardless of object key insertion order', () => {
    const a = { property: 'plan', operator: 'eq', value: 'pro' };
    const b = { operator: 'eq', property: 'plan', value: 'pro' };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it('handles nested objects recursively', () => {
    const a = { steps: [{ event: 'click', filters: [{ property: 'plan', operator: 'eq', value: 'pro' }] }] };
    const b = { steps: [{ filters: [{ value: 'pro', operator: 'eq', property: 'plan' }], event: 'click' }] };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it('preserves array element order (step order matters for funnels)', () => {
    const a = stableStringify({ steps: [{ event: 'pageview' }, { event: 'click' }] });
    const b = stableStringify({ steps: [{ event: 'click' }, { event: 'pageview' }] });
    expect(a).not.toBe(b);
  });

  it('handles null, primitives, and mixed types', () => {
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify(42)).toBe('42');
    expect(stableStringify('hello')).toBe('"hello"');
    expect(stableStringify(true)).toBe('true');
    expect(stableStringify([1, 'two', null])).toBe('[1,"two",null]');
  });

  it('produces different output for semantically different objects', () => {
    const a = { property: 'plan', value: 'pro' };
    const b = { property: 'plan', value: 'starter' };
    expect(stableStringify(a)).not.toBe(stableStringify(b));
  });
});

describe('cache key stability', () => {
  it('identical params with different key order produce the same cache key', async () => {
    const cachedAt = '2025-01-31T12:00:00.000Z';
    const queryResult = [{ x: 1 }];
    const cachedValue = JSON.stringify({ data: queryResult, cached_at: cachedAt });

    // First request writes the cache
    const redis = {
      get: vi.fn()
        .mockResolvedValueOnce(null)          // first call: miss
        .mockResolvedValueOnce(cachedValue),  // second call: hit (same key)
      set: vi.fn().mockResolvedValue('OK'),
    } as any;
    const query = vi.fn().mockResolvedValue(queryResult);
    const logger = { debug: vi.fn(), error: vi.fn() } as any;
    const ch = {} as any;

    const paramsA = { project_id: 'proj-1', date_from: '2025-01-01', date_to: '2025-01-31' };
    // Same params, different key insertion order
    const paramsB = { date_to: '2025-01-31', project_id: 'proj-1', date_from: '2025-01-01' };

    await withAnalyticsCache({ prefix: 'trend', redis, ch, params: paramsA, query, logger });
    const result = await withAnalyticsCache({ prefix: 'trend', redis, ch, params: paramsB, query, logger });

    // Both calls must use the exact same Redis key
    const keyA = redis.get.mock.calls[0][0] as string;
    const keyB = redis.get.mock.calls[1][0] as string;
    expect(keyA).toBe(keyB);

    // Second call should be a cache hit
    expect(result.from_cache).toBe(true);
    expect(query).toHaveBeenCalledOnce();
  });

  it('identical filter params with different key order produce same cache key', async () => {
    const filterA = { property: 'plan', operator: 'eq', value: 'pro' };
    const filterB = { operator: 'eq', property: 'plan', value: 'pro' };
    const paramsA = { project_id: 'proj-1', steps: [{ event: 'click', filters: [filterA] }] };
    const paramsB = { project_id: 'proj-1', steps: [{ filters: [filterB], event: 'click' }] };

    expect(stableStringify(paramsA)).toBe(stableStringify(paramsB));
  });
});

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
