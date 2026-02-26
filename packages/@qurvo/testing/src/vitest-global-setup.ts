import * as fs from 'fs';
import { startGlobalContainers, stopGlobalContainers } from './global-containers';

const LOCK_FILE = '/tmp/qurvo-integration-tests.lock';
const LOCK_TIMEOUT_MS = 1_800_000; // 30 minutes
const LOCK_POLL_INTERVAL_MS = 500;

/**
 * Checks whether a PID from a lock file is still alive.
 * Returns false if the PID does not exist or the check fails.
 */
function isPidAlive(pid: number): boolean {
  try {
    // Signal 0: does not kill the process, only checks if it exists.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Acquires an exclusive file lock by polling with stale lock detection.
 *
 * Strategy:
 *  1. Try to create the lock file exclusively (`wx` flag — fails if exists).
 *  2. If the lock file already exists, read the PID stored inside.
 *  3. If that PID is dead (stale lock), delete the file and retry immediately.
 *  4. If the PID is alive (another vitest process is running), wait
 *     `LOCK_POLL_INTERVAL_MS` ms and try again.
 *  5. After `timeoutMs`, throw a timeout error.
 *
 * Returns a release function that removes the lock file.
 */
async function acquireFileLock(lockFile: string, timeoutMs: number): Promise<() => void> {
  const deadline = Date.now() + timeoutMs;
  const ownPid = process.pid;

  console.log(`[testing] Waiting for integration test lock (pid=${ownPid})…`);

  while (true) {
    // Attempt exclusive create.
    try {
      fs.writeFileSync(lockFile, String(ownPid), { flag: 'wx', encoding: 'utf8' });
      // Successfully wrote the lock file — we own the lock.
      console.log(`[testing] Lock acquired (pid=${ownPid})`);
      return () => {
        try {
          fs.unlinkSync(lockFile);
        } catch {
          // Ignore: lock file may already be gone (e.g. manual cleanup).
        }
      };
    } catch (err: unknown) {
      // Lock file already exists — check if it is stale.
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        throw err; // Unexpected error — rethrow.
      }
    }

    // Read existing lock file to detect stale PIDs.
    try {
      const content = fs.readFileSync(lockFile, 'utf8').trim();
      const lockPid = parseInt(content, 10);

      if (!isNaN(lockPid) && !isPidAlive(lockPid)) {
        // Stale lock — previous process is gone. Remove and retry immediately.
        console.warn(
          `[testing] Stale lock detected (pid=${lockPid} is dead). Removing lock file and retrying.`,
        );
        try {
          fs.unlinkSync(lockFile);
        } catch {
          // Another concurrent process may have already removed it — that is fine.
        }
        continue; // Retry immediately without sleeping.
      }
    } catch {
      // Could not read lock file (e.g. race: another process removed it between
      // our failed write and the read). Retry in the next poll cycle.
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `[testing] Timed out waiting for integration test lock after ${timeoutMs / 1000}s. ` +
          `Another vitest process may be holding the lock. Remove ${lockFile} manually if needed.`,
      );
    }

    await new Promise<void>((resolve) => setTimeout(resolve, LOCK_POLL_INTERVAL_MS));
  }
}

export function createGlobalSetup() {
  let releaseLock: (() => void) | null = null;

  return {
    async setup() {
      releaseLock = await acquireFileLock(LOCK_FILE, LOCK_TIMEOUT_MS);

      const coords = await startGlobalContainers();

      process.env.TEST_PG_HOST = coords.pgHost;
      process.env.TEST_PG_PORT = String(coords.pgPort);
      process.env.TEST_PG_USER = coords.pgUser;
      process.env.TEST_PG_PASSWORD = coords.pgPassword;

      process.env.TEST_REDIS_HOST = coords.redisHost;
      process.env.TEST_REDIS_PORT = String(coords.redisPort);

      process.env.TEST_CH_HOST = coords.chHost;
      process.env.TEST_CH_PORT = String(coords.chPort);
      process.env.TEST_CH_USER = coords.chUser;
      process.env.TEST_CH_PASSWORD = coords.chPassword;

      const shutdown = async () => {
        await stopGlobalContainers();
        releaseLock?.();
        releaseLock = null;
        process.exit(0);
      };
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
    },

    async teardown() {
      await stopGlobalContainers();
      releaseLock?.();
      releaseLock = null;
    },
  };
}
