import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { sql, inArray } from 'drizzle-orm';
import { persons, type Database } from '@qurvo/db';
import { DRIZZLE } from '../providers/drizzle.provider';
import { parseUserProperties } from './person-writer.service';
import type { PersonWriterService } from './person-writer.service';

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

const KNOWN_DISTINCT_IDS_CAP = 100_000;

@Injectable()
export class PersonBatchStore {
  private pendingPersons = new Map<string, PendingPerson>();
  private pendingDistinctIds = new Map<string, PendingDistinctId>();
  private pendingMerges: PendingMerge[] = [];
  private knownDistinctIds = new Set<string>();

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

    // Track distinct_id if not already known
    const cacheKey = `${projectId}:${distinctId}`;
    if (!this.knownDistinctIds.has(cacheKey)) {
      this.pendingDistinctIds.set(cacheKey, { projectId, personId, distinctId });
    }
  }

  enqueueMerge(projectId: string, fromPersonId: string, intoPersonId: string): void {
    this.pendingMerges.push({ projectId, fromPersonId, intoPersonId });
  }

  async flush(personWriter: PersonWriterService): Promise<void> {
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

    // 1. Bulk upsert persons
    if (pendingPersons.size > 0) {
      await this.flushPersons(pendingPersons);
    }

    // 2. Bulk upsert distinct_ids
    if (pendingDistinctIds.size > 0) {
      await this.flushDistinctIds(pendingDistinctIds);
    }

    // 3. Execute pending merges (rare, sequential)
    for (const merge of pendingMerges) {
      try {
        await personWriter.mergePersons(merge.projectId, merge.fromPersonId, merge.intoPersonId);
      } catch (err) {
        this.logger.error({ err, ...merge }, 'Person merge failed');
      }
    }
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
    for (const [personId, update] of pending) {
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

    // Bulk upsert via raw SQL for best performance
    const valuesList = sql.join(
      values.map((v) =>
        sql`(${v.id}::uuid, ${v.project_id}::uuid, ${JSON.stringify(v.properties)}::jsonb, now(), now())`,
      ),
      sql`, `,
    );
    await this.db.execute(sql`
      INSERT INTO persons (id, project_id, properties, created_at, updated_at)
      VALUES ${valuesList}
      ON CONFLICT (id) DO UPDATE SET
        properties = excluded.properties,
        updated_at = excluded.updated_at
    `);

    this.logger.debug({ count: values.length }, 'Batch upserted persons');
  }

  private async flushDistinctIds(pending: Map<string, PendingDistinctId>): Promise<void> {
    const entries = [...pending.values()];

    const valuesList = sql.join(
      entries.map((e) => sql`(${e.projectId}::uuid, ${e.personId}::uuid, ${e.distinctId})`),
      sql`, `,
    );
    await this.db.execute(sql`
      INSERT INTO person_distinct_ids (project_id, person_id, distinct_id)
      VALUES ${valuesList}
      ON CONFLICT DO NOTHING
    `);

    // Mark as known
    for (const key of pending.keys()) {
      this.knownDistinctIds.add(key);
    }

    // Prevent unbounded growth
    if (this.knownDistinctIds.size > KNOWN_DISTINCT_IDS_CAP) {
      this.knownDistinctIds.clear();
    }

    this.logger.debug({ count: entries.length }, 'Batch upserted person_distinct_ids');
  }
}
