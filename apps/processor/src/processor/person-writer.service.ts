import { Injectable, Inject } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { eq, and, sql } from 'drizzle-orm';
import { persons, personDistinctIds, type Database } from '@qurvo/db';
import { DRIZZLE } from '../providers/drizzle.provider';


export interface ParsedUserProperties {
  setProps: Record<string, unknown>;
  setOnceProps: Record<string, unknown>;
  unsetKeys: string[];
}

/**
 * Parses the user_properties JSON field from an event.
 *
 * PostHog-style semantics:
 *  - root-level keys (not $set/$set_once/$unset) → implicit $set
 *  - $set object → explicit set (overwrites existing)
 *  - $set_once object → only sets if property doesn't exist yet
 *  - $unset array → removes listed keys
 */
export function parseUserProperties(raw: string): ParsedUserProperties {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw || '{}') as Record<string, unknown>;
  } catch {
    obj = {};
  }

  const setOnceProps = (obj['$set_once'] as Record<string, unknown> | undefined) ?? {};
  const unsetKeys = Array.isArray(obj['$unset']) ? (obj['$unset'] as unknown[]).filter((k): k is string => typeof k === 'string') : [];
  const explicitSet = (obj['$set'] as Record<string, unknown> | undefined) ?? {};

  // All root-level keys that are not reserved are treated as implicit $set
  const setProps: Record<string, unknown> = { ...explicitSet };
  for (const [k, v] of Object.entries(obj)) {
    if (k !== '$set' && k !== '$set_once' && k !== '$unset') {
      setProps[k] = v;
    }
  }

  return { setProps, setOnceProps, unsetKeys };
}

@Injectable()
export class PersonWriterService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectPinoLogger(PersonWriterService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Merges the anonymous person into the identified user's person.
   * Called when $identify event merges two previously separate persons.
   *
   * - Re-points all distinct_ids from anonPersonId → userPersonId
   * - Merges anon properties into user properties (user wins on conflict)
   * - Deletes the now-orphaned anon persons row
   *
   * All mutations run inside a single transaction to prevent partial states.
   */
  async mergePersons(projectId: string, fromPersonId: string, intoPersonId: string): Promise<void> {
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
}
