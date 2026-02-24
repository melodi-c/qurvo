import { eq, and } from 'drizzle-orm';
import { persons, personDistinctIds } from '@qurvo/db';
import type { Database } from '@qurvo/db';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function waitForPersonInPg(
  db: Database,
  personId: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const { timeoutMs = 10_000, intervalMs = 200 } = opts;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const rows = await db
      .select({ id: persons.id })
      .from(persons)
      .where(eq(persons.id, personId))
      .limit(1);
    if (rows.length > 0) return;
    await sleep(intervalMs);
  }

  throw new Error(`waitForPersonInPg timed out after ${timeoutMs}ms for person_id=${personId}`);
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
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<string> {
  const { timeoutMs = 10_000, intervalMs = 200 } = opts;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const personId = await getDistinctIdMapping(db, projectId, distinctId);
    if (personId) return personId;
    await sleep(intervalMs);
  }

  throw new Error(
    `waitForDistinctIdMapping timed out after ${timeoutMs}ms for distinctId=${distinctId}`,
  );
}

export async function waitForPersonDeleted(
  db: Database,
  personId: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const { timeoutMs = 10_000, intervalMs = 200 } = opts;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const rows = await db
      .select({ id: persons.id })
      .from(persons)
      .where(eq(persons.id, personId))
      .limit(1);
    if (rows.length === 0) return;
    await sleep(intervalMs);
  }

  throw new Error(`waitForPersonDeleted timed out after ${timeoutMs}ms for person_id=${personId}`);
}

export async function waitForPersonProperties(
  db: Database,
  personId: string,
  predicate: (props: Record<string, unknown>) => boolean,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<Record<string, unknown>> {
  const { timeoutMs = 10_000, intervalMs = 200 } = opts;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const rows = await db
      .select({ properties: persons.properties })
      .from(persons)
      .where(eq(persons.id, personId))
      .limit(1);
    const props = (rows[0]?.properties as Record<string, unknown>) ?? {};
    if (predicate(props)) return props;
    await sleep(intervalMs);
  }

  throw new Error(
    `waitForPersonProperties timed out after ${timeoutMs}ms for person_id=${personId}`,
  );
}
