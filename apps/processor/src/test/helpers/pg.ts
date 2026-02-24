import { eq, and } from 'drizzle-orm';
import { persons, personDistinctIds } from '@qurvo/db';
import type { Database } from '@qurvo/db';
import { pollUntil, type PollOptions } from './poll';

export async function waitForPersonInPg(
  db: Database,
  personId: string,
  opts: PollOptions = {},
): Promise<void> {
  await pollUntil(
    () => db.select({ id: persons.id }).from(persons).where(eq(persons.id, personId)).limit(1),
    (rows) => rows.length > 0,
    `waitForPersonInPg(${personId})`,
    opts,
  );
}

export async function getPersonProperties(
  db: Database,
  personId: string,
): Promise<Record<string, unknown>> {
  const rows = await db
    .select({ properties: persons.properties })
    .from(persons)
    .where(eq(persons.id, personId))
    .limit(1);
  return (rows[0]?.properties as Record<string, unknown>) ?? {};
}

export async function getDistinctIdMapping(
  db: Database,
  projectId: string,
  distinctId: string,
): Promise<string | null> {
  const rows = await db
    .select({ person_id: personDistinctIds.person_id })
    .from(personDistinctIds)
    .where(
      and(
        eq(personDistinctIds.project_id, projectId),
        eq(personDistinctIds.distinct_id, distinctId),
      ),
    )
    .limit(1);
  return rows[0]?.person_id ?? null;
}

export async function waitForDistinctIdMapping(
  db: Database,
  projectId: string,
  distinctId: string,
  opts: PollOptions = {},
): Promise<string> {
  const result = await pollUntil(
    () => getDistinctIdMapping(db, projectId, distinctId),
    (personId) => personId !== null,
    `waitForDistinctIdMapping(${distinctId})`,
    opts,
  );
  return result!;
}

export async function waitForPersonDeleted(
  db: Database,
  personId: string,
  opts: PollOptions = {},
): Promise<void> {
  await pollUntil(
    () => db.select({ id: persons.id }).from(persons).where(eq(persons.id, personId)).limit(1),
    (rows) => rows.length === 0,
    `waitForPersonDeleted(${personId})`,
    opts,
  );
}

export async function waitForPersonProperties(
  db: Database,
  personId: string,
  predicate: (props: Record<string, unknown>) => boolean,
  opts: PollOptions = {},
): Promise<Record<string, unknown>> {
  return pollUntil(
    async () => {
      const rows = await db
        .select({ properties: persons.properties })
        .from(persons)
        .where(eq(persons.id, personId))
        .limit(1);
      return (rows[0]?.properties as Record<string, unknown>) ?? {};
    },
    predicate,
    `waitForPersonProperties(${personId})`,
    opts,
  );
}
