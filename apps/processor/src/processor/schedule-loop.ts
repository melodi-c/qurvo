/**
 * Creates a self-rescheduling loop that calls `fn` every `intervalMs` milliseconds.
 * Errors are forwarded to `onError`; the loop continues regardless.
 *
 * Returns a controller with:
 *  - `start()` — arms the first timeout and returns the handle (or null if already stopped)
 *  - `stop()`  — prevents further reschedules (call clearTimeout on the active handle externally)
 */
export function createScheduledLoop(
  fn: () => Promise<void>,
  intervalMs: number,
  onError: (err: unknown) => void,
): { start(): NodeJS.Timeout | null; stop(): void } {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  function schedule(): NodeJS.Timeout | null {
    if (stopped) {return null;}
    timer = setTimeout(async () => {
      try {
        await fn();
      } catch (err) {
        onError(err);
      }
      schedule();
    }, intervalMs);
    return timer;
  }

  return {
    start(): NodeJS.Timeout | null {
      return schedule();
    },
    stop(): void {
      stopped = true;
    },
  };
}
