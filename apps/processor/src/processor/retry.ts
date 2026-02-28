import type { PinoLogger } from 'nestjs-pino';

export interface RetryOptions {
  /** Maximum number of attempts (default: 3). */
  maxAttempts?: number;
  /** Base delay in ms; multiplied by attempt number + jitter (default: 50). */
  baseDelayMs?: number;
  /** Called when all retries are exhausted (before re-throwing). */
  onExhausted?: () => void;
}

/**
 * Retry a function with linear backoff + jitter.
 * On exhausted retries, calls `onExhausted` (if provided) and re-throws.
 */
// eslint-disable-next-line complexity -- retry loop with backoff, logging, and exhaustion handler
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  logger: PinoLogger,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 50;

  let tries = 1;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (tries >= maxAttempts) {
        logger.error({ err, tries }, `${label} exhausted retries`);
        opts.onExhausted?.();
        throw err;
      }
      const jitter = Math.floor(Math.random() * baseDelayMs);
      const delay = tries * baseDelayMs + jitter;
      logger.warn({ err, tries, delay }, `${label} retry`);
      await new Promise((r) => setTimeout(r, delay));
      tries++;
    }
  }
}
