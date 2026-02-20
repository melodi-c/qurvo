import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { createClickHouse } from '@shot/clickhouse';
import type { ClickHouseClient } from '@shot/clickhouse';
import { createDb, type Database } from '@shot/db';
import Redis from 'ioredis';
import { applyClickHouseMigration } from './migrate-clickhouse';
import { applyPostgresMigration } from './migrate-postgres';

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

  pgContainer: StartedPostgreSqlContainer;
  redisContainer: StartedTestContainer;
  chContainer: StartedTestContainer;
}

let contextPromise: Promise<ContainerContext> | null = null;

export async function setupContainers(): Promise<ContainerContext> {
  if (contextPromise) return contextPromise;
  contextPromise = startContainers();
  return contextPromise;
}

export async function teardownContainers(): Promise<void> {
  if (!contextPromise) return;
  const ctx = await contextPromise;
  contextPromise = null;
  await ctx.ch.close();
  ctx.redis.disconnect();
  await Promise.all([
    ctx.pgContainer.stop(),
    ctx.redisContainer.stop(),
    ctx.chContainer.stop(),
  ]);
}

async function startContainers(): Promise<ContainerContext> {
  const [pgContainer, redisContainer, chContainer] = await Promise.all([
    new PostgreSqlContainer('postgres:17-alpine')
      .withDatabase('shot_analytics')
      .withUsername('shot')
      .withPassword('shot_secret')
      .start(),

    new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
      .start(),

    new GenericContainer('clickhouse/clickhouse-server:24.8')
      .withEnvironment({
        CLICKHOUSE_DB: 'shot_analytics',
        CLICKHOUSE_USER: 'shot',
        CLICKHOUSE_PASSWORD: 'shot_secret',
        CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: '1',
      })
      .withExposedPorts(8123)
      .withWaitStrategy(Wait.forHttp('/ping', 8123).forStatusCode(200))
      .start(),
  ]);

  const pgUrl = pgContainer.getConnectionUri();
  const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;
  const clickhouseUrl = `http://${chContainer.getHost()}:${chContainer.getMappedPort(8123)}`;
  const clickhouseUser = 'shot';
  const clickhousePassword = 'shot_secret';
  const clickhouseDb = 'shot_analytics';

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
    applyClickHouseMigration(ch, clickhouseUser, clickhousePassword),
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
