import { Injectable, Inject } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { eq, and } from 'drizzle-orm';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { personDistinctIds } from '@qurvo/db';
import type { Database } from '@qurvo/db';
import { REDIS } from '../providers/redis.provider';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import { DRIZZLE } from '../providers/drizzle.provider';
import { PERSON_REDIS_TTL_SECONDS, RETRY_CLICKHOUSE } from '../constants';
import { withRetry } from './retry';

@Injectable()
export class PersonResolverService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectPinoLogger(PersonResolverService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Returns the person_id for a given distinct_id.
   * Creates a new person_id if one doesn't exist yet.
   *
   * Uses SET NX for atomic get-or-create to avoid race conditions
   * when multiple processor instances run simultaneously (e.g. during hot-reload).
   */
  async resolve(projectId: string, distinctId: string): Promise<string> {
    const key = this.redisKey(projectId, distinctId);
    const candidate = randomUUID();

    // Atomically set only if the key doesn't already exist
    const result = await this.redis.set(key, candidate, 'EX', PERSON_REDIS_TTL_SECONDS, 'NX');
    if (result !== null) {
      // Redis cache miss — check PostgreSQL to avoid cold-start identity fragmentation
      const rows = await this.db
        .select({ person_id: personDistinctIds.person_id })
        .from(personDistinctIds)
        .where(and(eq(personDistinctIds.project_id, projectId), eq(personDistinctIds.distinct_id, distinctId)))
        .limit(1);

      if (rows.length > 0) {
        // Person already exists in DB — overwrite Redis with correct ID
        await this.redis.set(key, rows[0].person_id, 'EX', PERSON_REDIS_TTL_SECONDS);
        return rows[0].person_id;
      }
      return candidate;
    }

    // Key already existed — get the value that was set by another instance
    const existing = await this.redis.get(key);
    if (existing) return existing;

    // Key disappeared between SET NX and GET (e.g. eviction) — write candidate again
    await this.redis.set(key, candidate, 'EX', PERSON_REDIS_TTL_SECONDS);
    return candidate;
  }

  /**
   * Handles $identify: merges the anonymous person into the user's person.
   * Returns the canonical person_id and the anon person_id that was merged (if any).
   *
   * Flow:
   *  1. Get or create person_id for user (distinct_id of the identify event).
   *  2. Get or create person_id for the anonymous_id.
   *  3. If they differ → write an override so old anon events resolve to the user's person.
   *  4. Update Redis so future anon events get the user's person_id directly.
   */
  async handleIdentify(
    projectId: string,
    userId: string,
    anonymousId: string,
  ): Promise<{ personId: string; mergedFromPersonId: string | null }> {
    const userPersonId = await this.resolve(projectId, userId);
    const anonKey = this.redisKey(projectId, anonymousId);
    const anonPersonId = await this.redis.get(anonKey);

    if (!anonPersonId) {
      // Check PostgreSQL for historical anon person (handles cold start / cache eviction)
      const rows = await this.db
        .select({ person_id: personDistinctIds.person_id })
        .from(personDistinctIds)
        .where(and(eq(personDistinctIds.project_id, projectId), eq(personDistinctIds.distinct_id, anonymousId)))
        .limit(1);

      if (rows.length > 0 && rows[0].person_id !== userPersonId) {
        // Found historical anon person — write override so old events resolve correctly
        const historicalAnonPersonId = rows[0].person_id;
        await this.writeOverride(projectId, anonymousId, userPersonId);
        await this.redis.set(anonKey, userPersonId, 'EX', PERSON_REDIS_TTL_SECONDS);
        return { personId: userPersonId, mergedFromPersonId: historicalAnonPersonId };
      }

      // Anonymous user was never seen or already same person
      await this.redis.set(anonKey, userPersonId, 'EX', PERSON_REDIS_TTL_SECONDS);
      return { personId: userPersonId, mergedFromPersonId: null };
    }

    if (anonPersonId === userPersonId) {
      // Already the same person, nothing to do.
      return { personId: userPersonId, mergedFromPersonId: null };
    }

    // Different persons → write an override entry so query-time dict resolves
    // all events with distinct_id = anonymousId to the user's person_id.
    await this.writeOverride(projectId, anonymousId, userPersonId);
    await this.redis.set(anonKey, userPersonId, 'EX', PERSON_REDIS_TTL_SECONDS);

    this.logger.info(
      { projectId, anonymousId, userId, anonPersonId, userPersonId },
      'Identity merged: anonymous person linked to user person',
    );

    return { personId: userPersonId, mergedFromPersonId: anonPersonId };
  }

  private async writeOverride(projectId: string, distinctId: string, personId: string): Promise<void> {
    await withRetry(
      () => this.ch.insert({
        table: 'person_distinct_id_overrides',
        values: [{ project_id: projectId, distinct_id: distinctId, person_id: personId, version: Date.now() }],
        format: 'JSONEachRow',
        clickhouse_settings: { date_time_input_format: 'best_effort' },
      }),
      'writeOverride',
      this.logger,
      RETRY_CLICKHOUSE,
    );
  }

  private redisKey(projectId: string, distinctId: string): string {
    return `person:${projectId}:${distinctId}`;
  }
}
