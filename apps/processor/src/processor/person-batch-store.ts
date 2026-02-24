import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { sql, inArray, eq, and } from 'drizzle-orm';
import { persons, personDistinctIds, type Database } from '@qurvo/db';
import { DRIZZLE } from '@qurvo/nestjs-infra';
import { parseUserProperties } from './person-utils';
import { withRetry } from './retry';
import { HourlyCache } from './hourly-cache';
import { RETRY_POSTGRES } from '../constants';
import { floorToHourMs } from './time-utils';

interface PendingPerson {
  projectId: string;
  setProps: Record<string, unknown>;
  setOnceProps: Record<string, unknown>;
  unsetKeys: Set<string>;
}

interface PendingDistinctId {
  projectId: string;
  personId: string;
  distinctId: string;
}

interface PendingMerge {
  projectId: string;
  fromPersonId: string;
  intoPersonId: string;
}

@Injectable()
export class PersonBatchStore {
  private pendingPersons = new Map<string, PendingPerson>();
  private pendingDistinctIds = new Map<string, PendingDistinctId>();
  private pendingMerges: PendingMerge[] = [];
  private readonly knownDistinctIds = new HourlyCache(100_000);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectPinoLogger(PersonBatchStore.name) private readonly logger: PinoLogger,
  ) {}

  enqueue(
    projectId: string,
    personId: string,
    distinctId: string,
    userPropertiesJson: string,
  ): void {
    const { setProps, setOnceProps, unsetKeys } = parseUserProperties(userPropertiesJson);

    const existing = this.pendingPersons.get(personId);
    if (existing) {
      // $set: later event wins
      for (const [k, v] of Object.entries(setProps)) {
        existing.setProps[k] = v;
        existing.unsetKeys.delete(k);
      }
      // $set_once: first event wins
      for (const [k, v] of Object.entries(setOnceProps)) {
        if (!(k in existing.setProps) && !(k in existing.setOnceProps)) {
          existing.setOnceProps[k] = v;
        }
      }
      // $unset
      for (const k of unsetKeys) {
        delete existing.setProps[k];
        delete existing.setOnceProps[k];
        existing.unsetKeys.add(k);
      }
    } else {
      this.pendingPersons.set(personId, {
        projectId,
        setProps: { ...setProps },
        setOnceProps: { ...setOnceProps },
        unsetKeys: new Set(unsetKeys),
      });
    }

    // Track distinct_id if not already known (auto-expires hourly for self-healing)
    const cacheKey = `${projectId}:${distinctId}`;
    const hourMs = floorToHourMs(Date.now());
    if (!this.knownDistinctIds.has(cacheKey, hourMs)) {
      this.pendingDistinctIds.set(cacheKey, { projectId, personId, distinctId });
    }
  }

  enqueueMerge(projectId: string, fromPersonId: string, intoPersonId: string): void {
    this.pendingMerges.push({ projectId, fromPersonId, intoPersonId });
  }

  private isFlushing = false;

  async flush(): Promise<void> {
    if (this.isFlushing) return;
    this.isFlushing = true;
    try {
      await this._doFlush();
    } finally {
      this.isFlushing = false;
    }
  }

  private async _doFlush(): Promise<void> {
    const pendingPersons = this.pendingPersons;
    const pendingDistinctIds = this.pendingDistinctIds;
    const pendingMerges = this.pendingMerges;

    // Swap out state before async work
    this.pendingPersons = new Map();
    this.pendingDistinctIds = new Map();
    this.pendingMerges = [];

    if (pendingPersons.size === 0 && pendingDistinctIds.size === 0 && pendingMerges.length === 0) {
      return;
    }

    try {
      // 1. Bulk upsert persons (with retry to avoid silent data loss)
      if (pendingPersons.size > 0) {
        await withRetry(
          () => this.flushPersons(pendingPersons),
          'flushPersons',
          this.logger,
          RETRY_POSTGRES,
        );
      }

      // 2. Bulk upsert distinct_ids (with retry; uses WHERE EXISTS to avoid FK violations)
      if (pendingDistinctIds.size > 0) {
        await withRetry(
          () => this.flushDistinctIds(pendingDistinctIds),
          'flushDistinctIds',
          this.logger,
          RETRY_POSTGRES,
        );
      }
    } catch (err) {
      // Re-queue swapped data so it's retried on the next flush cycle.
      // Merge back: new entries accumulated during async work take precedence.
      this.requeuePersons(pendingPersons);
      this.requeueDistinctIds(pendingDistinctIds);
      this.pendingMerges = [...pendingMerges, ...this.pendingMerges];
      throw err;
    }

    // 3. Execute pending merges (rare, sequential, with retry to prevent data loss)
    for (const merge of pendingMerges) {
      try {
        await withRetry(
          () => this.mergePersons(merge.projectId, merge.fromPersonId, merge.intoPersonId),
          'mergePersons',
          this.logger,
          RETRY_POSTGRES,
        );
      } catch (err) {
        this.logger.error({ err, ...merge }, 'Person merge failed after retries — PG/CH may be out of sync');
      }
    }
  }

  /** Re-queue persons that failed to flush. Newer entries (accumulated during flush) take precedence. */
  private requeuePersons(old: Map<string, PendingPerson>): void {
    for (const [personId, pending] of old) {
      if (!this.pendingPersons.has(personId)) {
        this.pendingPersons.set(personId, pending);
      }
    }
  }

  /** Re-queue distinct IDs that failed to flush. Newer entries take precedence. */
  private requeueDistinctIds(old: Map<string, PendingDistinctId>): void {
    for (const [key, pending] of old) {
      if (!this.pendingDistinctIds.has(key)) {
        this.pendingDistinctIds.set(key, pending);
      }
    }
  }

  /**
   * Merges the anonymous person into the identified user's person.
   * Called when $identify event merges two previously separate persons.
   *
   * - Re-points all distinct_ids from fromPersonId → intoPersonId
   * - Merges anon properties into user properties (user wins on conflict)
   * - Deletes the now-orphaned anon persons row
   *
   * All mutations run inside a single transaction to prevent partial states.
   */
  private async mergePersons(projectId: string, fromPersonId: string, intoPersonId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      // 1. Remove any fromPerson distinct_id rows that are already claimed by intoPerson
      await tx
        .delete(personDistinctIds)
        .where(
          and(
            eq(personDistinctIds.project_id, projectId),
            eq(personDistinctIds.person_id, fromPersonId),
            sql`${personDistinctIds.distinct_id} IN (
              SELECT distinct_id FROM person_distinct_ids
              WHERE project_id = ${projectId} AND person_id = ${intoPersonId}
            )`,
          ),
        );

      // 2. Re-point remaining distinct_id mappings from the anon person to the user person
      await tx
        .update(personDistinctIds)
        .set({ person_id: intoPersonId })
        .where(
          and(
            eq(personDistinctIds.project_id, projectId),
            eq(personDistinctIds.person_id, fromPersonId),
          ),
        );

      // 3. Read both persons' properties for merge
      const [anonRow] = await tx
        .select({ properties: persons.properties })
        .from(persons)
        .where(and(eq(persons.id, fromPersonId), eq(persons.project_id, projectId)))
        .limit(1);

      if (!anonRow) return;

      const [userRow] = await tx
        .select({ properties: persons.properties })
        .from(persons)
        .where(and(eq(persons.id, intoPersonId), eq(persons.project_id, projectId)))
        .limit(1);

      if (userRow) {
        // User's properties take precedence over anon properties
        const merged = {
          ...(anonRow.properties as Record<string, unknown>),
          ...(userRow.properties as Record<string, unknown>),
        };

        await tx
          .update(persons)
          .set({ properties: merged, updated_at: new Date() })
          .where(and(eq(persons.id, intoPersonId), eq(persons.project_id, projectId)));
      }

      // 4. Remove the now-merged anon person record
      await tx
        .delete(persons)
        .where(and(eq(persons.id, fromPersonId), eq(persons.project_id, projectId)));
    });

    this.logger.info(
      { projectId, fromPersonId, intoPersonId },
      'Person records merged in PostgreSQL',
    );
  }

  private async flushPersons(pending: Map<string, PendingPerson>): Promise<void> {
    const personIds = [...pending.keys()];

    // Prefetch existing persons
    const existingRows = await this.db
      .select({ id: persons.id, properties: persons.properties })
      .from(persons)
      .where(inArray(persons.id, personIds));

    const existingMap = new Map<string, Record<string, unknown>>();
    for (const row of existingRows) {
      existingMap.set(row.id, row.properties as Record<string, unknown>);
    }

    // Compute final properties for each person
    const values: Array<{ id: string; project_id: string; properties: Record<string, unknown> }> = [];
    const sortedIds = [...pending.keys()].sort();
    for (const personId of sortedIds) {
      const update = pending.get(personId)!;
      const existingProps = existingMap.get(personId) ?? {};
      // Merge: setOnce < existing < set, then remove unset keys
      const merged: Record<string, unknown> = {
        ...update.setOnceProps,
        ...existingProps,
        ...update.setProps,
      };
      for (const k of update.unsetKeys) {
        delete merged[k];
      }
      values.push({ id: personId, project_id: update.projectId, properties: merged });
    }

    // Bulk upsert via raw SQL for best performance.
    // updated_at is floored to the hour (PostHog pattern) so that multiple
    // events from the same person within one hour don't generate redundant writes.
    // The WHERE clause skips the UPDATE entirely if properties haven't changed
    // AND we're still in the same hour — eliminating PG write amplification.
    const hourTs = new Date(floorToHourMs(Date.now())).toISOString();
    const valuesList = sql.join(
      values.map((v) =>
        sql`(${v.id}::uuid, ${v.project_id}::uuid, ${JSON.stringify(v.properties)}::jsonb, now(), ${hourTs}::timestamptz)`,
      ),
      sql`, `,
    );
    await this.db.execute(sql`
      INSERT INTO persons (id, project_id, properties, created_at, updated_at)
      VALUES ${valuesList}
      ON CONFLICT (id) DO UPDATE SET
        properties = excluded.properties,
        updated_at = excluded.updated_at
      WHERE persons.properties IS DISTINCT FROM excluded.properties
         OR persons.updated_at < excluded.updated_at
    `);

    this.logger.debug({ count: values.length }, 'Batch upserted persons');
  }

  private async flushDistinctIds(pending: Map<string, PendingDistinctId>): Promise<void> {
    const entries = [...pending.values()].sort((a, b) =>
      a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 :
      a.distinctId < b.distinctId ? -1 : a.distinctId > b.distinctId ? 1 : 0,
    );

    // Use INSERT...SELECT...WHERE EXISTS to skip entries referencing deleted/missing persons (FK safety)
    const valuesList = sql.join(
      entries.map((e) => sql`(${e.projectId}::uuid, ${e.personId}::uuid, ${e.distinctId}::text)`),
      sql`, `,
    );
    await this.db.execute(sql`
      INSERT INTO person_distinct_ids (project_id, person_id, distinct_id)
      SELECT v.project_id, v.person_id, v.distinct_id
      FROM (VALUES ${valuesList}) AS v(project_id, person_id, distinct_id)
      WHERE EXISTS (SELECT 1 FROM persons WHERE id = v.person_id)
      ON CONFLICT DO NOTHING
    `);

    // Mark as known (auto-expires hourly; HourlyCache handles eviction internally)
    const hourMs = floorToHourMs(Date.now());
    const ok = this.knownDistinctIds.markSeen(pending.keys(), hourMs);
    if (!ok) {
      this.logger.warn({ cacheSize: this.knownDistinctIds.size }, 'knownDistinctIds cache full after eviction');
    }

    this.logger.debug({ count: entries.length }, 'Batch upserted person_distinct_ids');
  }
}
