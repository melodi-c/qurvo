import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from '../../processor/retry.js';
import type { PinoLogger } from 'nestjs-pino';

function makeLogger(): PinoLogger {
  return {
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  } as unknown as PinoLogger;
}

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the result immediately on first success', async () => {
    const logger = makeLogger();
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await withRetry(fn, 'test', logger);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('retries the correct number of times and succeeds on Nth attempt', async () => {
    const logger = makeLogger();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce('success on 3rd');

    // Attach the assertion first, then advance timers
    const promise = withRetry(fn, 'test', logger, { maxAttempts: 3, baseDelayMs: 0 });
    const resultPromise = expect(promise).resolves.toBe('success on 3rd');
    await vi.runAllTimersAsync();
    await resultPromise;

    expect(fn).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('throws after exhausting all attempts', async () => {
    const logger = makeLogger();
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    // Attach rejection handler immediately to prevent unhandled rejection
    const promise = withRetry(fn, 'test', logger, { maxAttempts: 3, baseDelayMs: 0 });
    const assertion = expect(promise).rejects.toThrow('always fails');
    await vi.runAllTimersAsync();
    await assertion;

    expect(fn).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('calls onExhausted callback before re-throwing', async () => {
    const logger = makeLogger();
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const onExhausted = vi.fn();

    const promise = withRetry(fn, 'test', logger, { maxAttempts: 2, baseDelayMs: 0, onExhausted });
    const assertion = expect(promise).rejects.toThrow();
    await vi.runAllTimersAsync();
    await assertion;

    expect(onExhausted).toHaveBeenCalledTimes(1);
  });

  it('does not call onExhausted when function eventually succeeds', async () => {
    const logger = makeLogger();
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce('ok');
    const onExhausted = vi.fn();

    const promise = withRetry(fn, 'test', logger, { maxAttempts: 3, baseDelayMs: 0, onExhausted });
    const assertion = expect(promise).resolves.toBe('ok');
    await vi.runAllTimersAsync();
    await assertion;

    expect(onExhausted).not.toHaveBeenCalled();
  });

  it('applies linear backoff: delay = attempt * baseDelayMs + jitter', async () => {
    const logger = makeLogger();
    // Use a fixed Math.random so jitter is deterministic (jitter = Math.floor(0 * 50) = 0)
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce('done');

    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

    const promise = withRetry(fn, 'test', logger, { maxAttempts: 3, baseDelayMs: 100 });
    const assertion = expect(promise).resolves.toBe('done');
    await vi.runAllTimersAsync();
    await assertion;

    // First retry: tries=1, delay = 1 * 100 + 0 = 100ms
    // Second retry: tries=2, delay = 2 * 100 + 0 = 200ms
    const delays = setTimeoutSpy.mock.calls.map((call) => call[1]);
    expect(delays).toContain(100);
    expect(delays).toContain(200);

    vi.restoreAllMocks();
  });

  it('uses default maxAttempts=3 when not specified', async () => {
    const logger = makeLogger();
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    const promise = withRetry(fn, 'test', logger, { baseDelayMs: 0 });
    const assertion = expect(promise).rejects.toThrow();
    await vi.runAllTimersAsync();
    await assertion;

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('logs warn on each retry with the attempt number and delay', async () => {
    const logger = makeLogger();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fn = vi.fn().mockRejectedValueOnce(new Error('e1')).mockResolvedValueOnce('ok');

    const promise = withRetry(fn, 'labelX', logger, { maxAttempts: 3, baseDelayMs: 50 });
    const assertion = expect(promise).resolves.toBe('ok');
    await vi.runAllTimersAsync();
    await assertion;

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ tries: 1, delay: 50 }),
      'labelX retry',
    );

    vi.restoreAllMocks();
  });

  it('logs error on exhaustion with the label', async () => {
    const logger = makeLogger();
    const fn = vi.fn().mockRejectedValue(new Error('boom'));

    const promise = withRetry(fn, 'myOp', logger, { maxAttempts: 1, baseDelayMs: 0 });
    const assertion = expect(promise).rejects.toThrow('boom');
    await vi.runAllTimersAsync();
    await assertion;

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ tries: 1 }),
      'myOp exhausted retries',
    );
  });

  it('succeeds on attempt 1 of 1 (maxAttempts=1 with no failure)', async () => {
    const logger = makeLogger();
    const fn = vi.fn().mockResolvedValue(42);

    const result = await withRetry(fn, 'test', logger, { maxAttempts: 1 });
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws immediately when maxAttempts=1 and fn fails', async () => {
    const logger = makeLogger();
    const fn = vi.fn().mockRejectedValue(new Error('instant fail'));
    const onExhausted = vi.fn();

    const promise = withRetry(fn, 'test', logger, { maxAttempts: 1, onExhausted });
    const assertion = expect(promise).rejects.toThrow('instant fail');
    await vi.runAllTimersAsync();
    await assertion;

    expect(fn).toHaveBeenCalledTimes(1);
    expect(onExhausted).toHaveBeenCalledTimes(1);
  });
});
