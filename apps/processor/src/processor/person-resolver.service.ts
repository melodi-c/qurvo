import { Injectable, Inject } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Redis from 'ioredis';
import { eq, and } from 'drizzle-orm';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { personDistinctIds } from '@qurvo/db';
import type { Database } from '@qurvo/db';
import { REDIS, CLICKHOUSE, DRIZZLE } from '@qurvo/nestjs-infra';
import { PERSON_REDIS_TTL_SECONDS, RETRY_CLICKHOUSE } from '../constants';
import { withRetry } from './retry';
import { deterministicPersonId } from './deterministic-person-id';

@Injectable()
export class PersonResolverService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectPinoLogger(PersonResolverService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Batch-prefetch person IDs for a set of distinct_ids in a single MGET.
   * Returns a mutable cache map that downstream methods will read from and populate.
   */
  async prefetchPersonIds(
    keys: Array<{ projectId: string; distinctId: string }>,
  ): Promise<Map<string, string>> {
    const cache = new Map<string, string>();
    if (keys.length === 0) {return cache;}

    const redisKeys = keys.map((k) => this.redisKey(k.projectId, k.distinctId));
    const values = await this.redis.mget(...redisKeys);

    for (let i = 0; i < redisKeys.length; i++) {
      if (values[i] !== null) {
        cache.set(redisKeys[i], values[i]!);
      }
    }
    return cache;
  }

  /**
   * Returns the person_id for a given distinct_id.
   * Uses a deterministic UUID (UUIDv5) so the same project+distinct_id always
   * produces the same person_id, eliminating races between processor instances.
   *
   * PG fallback is kept for backward compatibility with pre-deterministic data.
   */
  async resolve(projectId: string, distinctId: string, cache: Map<string, string>): Promise<string> {
    const key = this.redisKey(projectId, distinctId);

    // 1. Check prefetched cache (populated by batch MGET)
    const cached = cache.get(key);
    if (cached) {return cached;}

    // 2. Compute deterministic person_id
    const candidate = deterministicPersonId(projectId, distinctId);

    // 3. Atomically set only if the key doesn't already exist
    const result = await this.redis.set(key, candidate, 'EX', PERSON_REDIS_TTL_SECONDS, 'NX');
    if (result !== null) {
      // Cache miss — check PG for existing mapping (backward compat with pre-deterministic UUIDs)
      const rows = await this.db
        .select({ person_id: personDistinctIds.person_id })
        .from(personDistinctIds)
        .where(and(eq(personDistinctIds.project_id, projectId), eq(personDistinctIds.distinct_id, distinctId)))
        .limit(1);

      if (rows.length > 0) {
        // Existing person in PG — honor it (may differ from deterministic for legacy data)
        await this.redis.set(key, rows[0].person_id, 'EX', PERSON_REDIS_TTL_SECONDS);
        cache.set(key, rows[0].person_id);
        return rows[0].person_id;
      }

      cache.set(key, candidate);
      return candidate;
    }

    // Key already existed — read the existing value
    const existing = await this.redis.get(key);
    if (existing) {
      cache.set(key, existing);
      return existing;
    }

    // Key disappeared between SET NX and GET (e.g. eviction) — write deterministic value
    await this.redis.set(key, candidate, 'EX', PERSON_REDIS_TTL_SECONDS);
    cache.set(key, candidate);
    return candidate;
  }

  /**
   * Handles $identify: merges the anonymous person into the user's person.
   * Returns the canonical person_id and the anon person_id that was merged (if any).
   */
  async handleIdentify(
    projectId: string,
    userId: string,
    anonymousId: string,
    cache: Map<string, string>,
  ): Promise<{ personId: string; mergedFromPersonId: string | null }> {
    const userPersonId = await this.resolve(projectId, userId, cache);
    const anonKey = this.redisKey(projectId, anonymousId);

    // Check cache first (populated by batch MGET), then Redis
    const anonPersonId = cache.get(anonKey) ?? await this.redis.get(anonKey);

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
        cache.set(anonKey, userPersonId);
        return { personId: userPersonId, mergedFromPersonId: historicalAnonPersonId };
      }

      // Anonymous user was never seen or already same person
      await this.redis.set(anonKey, userPersonId, 'EX', PERSON_REDIS_TTL_SECONDS);
      cache.set(anonKey, userPersonId);
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
    cache.set(anonKey, userPersonId);

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
