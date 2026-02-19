import { Injectable, Inject } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import type { ClickHouseClient } from '@shot/clickhouse';
import { REDIS } from '../providers/redis.provider';
import { CLICKHOUSE } from '../providers/clickhouse.provider';

@Injectable()
export class PersonResolverService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
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
    const result = await this.redis.set(key, candidate, 'NX');
    if (result !== null) {
      // We won the race and created a new person
      return candidate;
    }

    // Key already existed — get the value that was set by another instance
    const existing = await this.redis.get(key);
    return existing ?? candidate;
  }

  /**
   * Handles $identify: merges the anonymous person into the user's person.
   * Returns the canonical person_id to stamp on the identify event.
   *
   * Flow:
   *  1. Get or create person_id for user (distinct_id of the identify event).
   *  2. Get or create person_id for the anonymous_id.
   *  3. If they differ → write an override so old anon events resolve to the user's person.
   *  4. Update Redis so future anon events get the user's person_id directly.
   */
  async handleIdentify(projectId: string, userId: string, anonymousId: string): Promise<string> {
    const userPersonId = await this.resolve(projectId, userId);
    const anonKey = this.redisKey(projectId, anonymousId);
    const anonPersonId = await this.redis.get(anonKey);

    if (!anonPersonId) {
      // Anonymous user was never seen — just link it forward, no historical events to fix.
      await this.redis.set(anonKey, userPersonId);
      return userPersonId;
    }

    if (anonPersonId === userPersonId) {
      // Already the same person, nothing to do.
      return userPersonId;
    }

    // Different persons → write an override entry so query-time dict resolves
    // all events with distinct_id = anonymousId to the user's person_id.
    await this.writeOverride(projectId, anonymousId, userPersonId);
    await this.redis.set(anonKey, userPersonId);

    this.logger.info(
      { projectId, anonymousId, userId, anonPersonId, userPersonId },
      'Identity merged: anonymous person linked to user person',
    );

    return userPersonId;
  }

  private async writeOverride(projectId: string, distinctId: string, personId: string): Promise<void> {
    await this.ch.insert({
      table: 'person_distinct_id_overrides',
      values: [{ project_id: projectId, distinct_id: distinctId, person_id: personId, version: Date.now() }],
      format: 'JSONEachRow',
      clickhouse_settings: { date_time_input_format: 'best_effort' },
    });
  }

  private redisKey(projectId: string, distinctId: string): string {
    return `person:${projectId}:${distinctId}`;
  }
}
