import { createClickHouse } from '@qurvo/clickhouse';
import { createDb } from '@qurvo/db';
import Redis from 'ioredis';
import postgres from 'postgres';
import { applyClickHouseMigration } from './migrate-clickhouse';
import { applyPostgresMigration } from './migrate-postgres';
import type { ContainerContext } from './containers';

let contextPromise: Promise<ContainerContext> | null = null;

export async function setupWorkerContext(): Promise<ContainerContext> {
  if (contextPromise) return contextPromise;
  contextPromise = createWorkerContext();
  return contextPromise;
}

export async function teardownWorkerContext(): Promise<void> {
  if (!contextPromise) return;
  const ctx = await contextPromise;
  await ctx.ch.close();
  ctx.redis.disconnect();
  contextPromise = null;
}

async function createWorkerContext(): Promise<ContainerContext> {
  const pgHost = process.env.TEST_PG_HOST!;
  const pgPort = Number(process.env.TEST_PG_PORT!);
  const pgUser = process.env.TEST_PG_USER!;
  const pgPassword = process.env.TEST_PG_PASSWORD!;

  const redisHost = process.env.TEST_REDIS_HOST!;
  const redisPort = Number(process.env.TEST_REDIS_PORT!);

  const chHost = process.env.TEST_CH_HOST!;
  const chPort = Number(process.env.TEST_CH_PORT!);
  const chUser = process.env.TEST_CH_USER!;
  const chPassword = process.env.TEST_CH_PASSWORD!;

  const workerId = Number(process.env.VITEST_POOL_ID ?? '1');
  const dbName = `qurvo_worker_${workerId}`;

  // --- PostgreSQL: create worker database ---
  const adminPgUrl = `postgresql://${pgUser}:${pgPassword}@${pgHost}:${pgPort}/postgres`;
  const adminSql = (postgres as any)(adminPgUrl, { max: 1 });
  await adminSql.unsafe(`DROP DATABASE IF EXISTS "${dbName}"`);
  await adminSql.unsafe(`CREATE DATABASE "${dbName}"`);
  await adminSql.end();

  const pgUrl = `postgresql://${pgUser}:${pgPassword}@${pgHost}:${pgPort}/${dbName}`;
  await applyPostgresMigration(pgUrl);
  const db = createDb(pgUrl);

  // --- ClickHouse: create worker database ---
  const clickhouseUrl = `http://${chHost}:${chPort}`;
  const adminCh = createClickHouse({
    url: clickhouseUrl,
    database: 'default',
    username: chUser,
    password: chPassword,
  });
  await adminCh.command({ query: `DROP DATABASE IF EXISTS "${dbName}"` });
  await adminCh.command({ query: `CREATE DATABASE "${dbName}"` });
  await adminCh.close();

  const ch = createClickHouse({
    url: clickhouseUrl,
    database: dbName,
    username: chUser,
    password: chPassword,
  });

  await applyClickHouseMigration(ch, chUser, chPassword, dbName);

  // Warmup: first INSERT after table creation may be silently lost
  await ch.command({
    query: `INSERT INTO events (event_id, project_id, event_name, event_type, distinct_id, person_id, timestamp)
            VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', '__warmup__', 'track', '__warmup__', '00000000-0000-0000-0000-000000000000', now())`,
  });

  // --- Redis: use database N for isolation ---
  const redisUrl = `redis://${redisHost}:${redisPort}/${workerId}`;
  const redis = new Redis(redisUrl);
  await redis.flushdb();

  return {
    pgUrl,
    redisUrl,
    clickhouseUrl,
    clickhouseUser: chUser,
    clickhousePassword: chPassword,
    clickhouseDb: dbName,
    ch,
    db,
    redis,
    pgContainer: null as any,
    redisContainer: null as any,
    chContainer: null as any,
  };
}
