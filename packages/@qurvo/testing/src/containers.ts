import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { createClickHouse } from '@qurvo/clickhouse';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { createDb, type Database } from '@qurvo/db';
import Redis from 'ioredis';
import { applyClickHouseMigration } from './migrate-clickhouse';
import { applyPostgresMigration } from './migrate-postgres';

const DB_NAME = 'qurvo_analytics';
const DB_USER = 'qurvo';
const DB_PASSWORD = 'qurvo_secret';

export interface ContainerContext {
  pgUrl: string;
  redisUrl: string;
  clickhouseUrl: string;
  clickhouseUser: string;
  clickhousePassword: string;
  clickhouseDb: string;

  ch: ClickHouseClient;
  db: Database;
  redis: Redis;

  pgContainer: StartedPostgreSqlContainer | null;
  redisContainer: StartedTestContainer | null;
  chContainer: StartedTestContainer | null;
}

let contextPromise: Promise<ContainerContext> | null = null;

/**
 * If TEST_PG_HOST is set (globalSetup started shared containers),
 * delegates to setupWorkerContext() for per-worker isolation.
 * Otherwise falls back to legacy mode (starts own containers).
 */
export async function setupContainers(): Promise<ContainerContext> {
  if (contextPromise) return contextPromise;

  if (process.env.TEST_PG_HOST) {
    const { setupWorkerContext } = await import('./worker-context');
    contextPromise = setupWorkerContext();
  } else {
    contextPromise = startContainers();
  }

  return contextPromise;
}

export async function teardownContainers(): Promise<void> {
  if (!contextPromise) return;

  if (process.env.TEST_PG_HOST) {
    const { teardownWorkerContext } = await import('./worker-context');
    await teardownWorkerContext();
  } else {
    const ctx = await contextPromise;

    // Reset contextPromise before stopping so that a repeated call after
    // a partial failure does not attempt to stop already-stopped containers.
    contextPromise = null;

    await ctx.ch.close();
    ctx.redis.disconnect();
    await ctx.db.$pool.end();

    const results = await Promise.allSettled([
      ctx.pgContainer != null ? ctx.pgContainer.stop() : Promise.resolve(),
      ctx.redisContainer != null ? ctx.redisContainer.stop() : Promise.resolve(),
      ctx.chContainer != null ? ctx.chContainer.stop() : Promise.resolve(),
    ]);

    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => r.reason);

    if (errors.length > 0) {
      console.error('[testing] teardownContainers: failed to stop some containers:', errors);
      throw new AggregateError(errors, `Failed to stop ${errors.length} container(s)`);
    }

    return;
  }

  contextPromise = null;
}

async function startContainers(): Promise<ContainerContext> {
  const [pgContainer, redisContainer, chContainer] = await Promise.all([
    new PostgreSqlContainer('postgres:17-alpine')
      .withDatabase(DB_NAME)
      .withUsername(DB_USER)
      .withPassword(DB_PASSWORD)
      .start(),

    new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
      .start(),

    new GenericContainer('clickhouse/clickhouse-server:24.8')
      .withEnvironment({
        CLICKHOUSE_DB: DB_NAME,
        CLICKHOUSE_USER: DB_USER,
        CLICKHOUSE_PASSWORD: DB_PASSWORD,
        CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: '1',
      })
      .withExposedPorts(8123)
      .withWaitStrategy(Wait.forHttp('/ping', 8123).forStatusCode(200))
      .start(),
  ]);

  const pgUrl = pgContainer.getConnectionUri();
  const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;
  const clickhouseUrl = `http://${chContainer.getHost()}:${chContainer.getMappedPort(8123)}`;
  const clickhouseUser = DB_USER;
  const clickhousePassword = DB_PASSWORD;
  const clickhouseDb = DB_NAME;

  const ch = createClickHouse({
    url: clickhouseUrl,
    database: clickhouseDb,
    username: clickhouseUser,
    password: clickhousePassword,
  });

  const db = createDb(pgUrl);
  const redis = new Redis(redisUrl);

  await Promise.all([
    applyPostgresMigration(pgUrl),
    applyClickHouseMigration(ch, clickhouseUser, clickhousePassword, clickhouseDb),
  ]);

  // Warmup: first INSERT after table creation may be silently lost
  await ch.command({
    query: `INSERT INTO events (event_id, project_id, event_name, event_type, distinct_id, person_id, timestamp)
            VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', '__warmup__', 'track', '__warmup__', '00000000-0000-0000-0000-000000000000', now())`,
  });

  return {
    pgUrl,
    redisUrl,
    clickhouseUrl,
    clickhouseUser,
    clickhousePassword,
    clickhouseDb,
    ch,
    db,
    redis,
    pgContainer,
    redisContainer,
    chContainer,
  };
}
