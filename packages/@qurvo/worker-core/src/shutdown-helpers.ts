import { PinoLogger } from 'nestjs-pino';

/** Minimal interface for the PostgreSQL pool exposed by @qurvo/db's Database. */
interface PgPool {
  end(): Promise<void>;
}

/** Minimal interface for @qurvo/db's Database (structural typing, no import). */
interface DbLike {
  $pool: PgPool;
}

/** Minimal interface for @qurvo/clickhouse's ClickHouseClient (structural typing, no import). */
interface ChLike {
  close(): Promise<void>;
}

/** Minimal interface for ioredis Redis client (structural typing, no import). */
interface RedisLike {
  quit(): Promise<string>;
}

/**
 * Closes the PostgreSQL connection pool, swallowing and logging any error.
 */
export async function shutdownDb(db: DbLike, logger: PinoLogger): Promise<void> {
  await db.$pool.end().catch((err: unknown) =>
    logger.warn({ err }, 'PostgreSQL pool close failed'),
  );
}

/**
 * Closes the ClickHouse client, swallowing and logging any error.
 */
export async function shutdownClickHouse(ch: ChLike, logger: PinoLogger): Promise<void> {
  await ch.close().catch((err: unknown) =>
    logger.warn({ err }, 'ClickHouse close failed'),
  );
}

/**
 * Quits the Redis client, swallowing and logging any error.
 */
export async function shutdownRedis(redis: RedisLike, logger: PinoLogger): Promise<void> {
  await redis.quit().catch((err: unknown) =>
    logger.warn({ err }, 'Redis quit failed'),
  );
}
