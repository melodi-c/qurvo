export interface PollOptions {
  timeoutMs?: number;
  intervalMs?: number;
}

/**
 * Polls `fn` until `predicate` returns true, with configurable timeout and interval.
 * Throws on timeout with a descriptive message including `label`.
 */
export async function pollUntil<T>(
  fn: () => Promise<T>,
  predicate: (result: T) => boolean,
  label: string,
  opts: PollOptions = {},
): Promise<T> {
  const { timeoutMs = 10_000, intervalMs = 200 } = opts;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await fn();
    if (predicate(result)) {return result;}
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`${label} timed out after ${timeoutMs}ms`);
}
