import { eq, and, inArray, sql } from 'drizzle-orm';
import { persons, personDistinctIds, type Database } from '@qurvo/db';
import type { PersonRow } from './persons.query';

/**
 * Fetches person rows by a list of UUIDs, scoped to a project.
 * Uses the same two-step pattern as `queryPersons`:
 *   1. Fetch person rows via index scan (no JOIN)
 *   2. Fetch distinct_ids only for the found persons
 */
export async function queryPersonsByIds(
  db: Database,
  projectId: string,
  personIds: string[],
): Promise<PersonRow[]> {
  if (personIds.length === 0) {return [];}

  const uniqueIds = [...new Set(personIds)];

  // Step A: fetch person rows
  const personRows = await db
    .select({
      id: persons.id,
      project_id: persons.project_id,
      properties: persons.properties,
      created_at: persons.created_at,
      updated_at: persons.updated_at,
    })
    .from(persons)
    .where(and(eq(persons.project_id, projectId), inArray(persons.id, uniqueIds)));

  if (personRows.length === 0) {return [];}

  // Step B: fetch distinct_ids only for the found persons
  const foundIds = personRows.map((r) => r.id);
  const distinctIdRows = await db
    .select({
      person_id: personDistinctIds.person_id,
      distinct_ids: sql<string[]>`array_agg(${personDistinctIds.distinct_id} ORDER BY ${personDistinctIds.created_at})`,
    })
    .from(personDistinctIds)
    .where(inArray(personDistinctIds.person_id, foundIds))
    .groupBy(personDistinctIds.person_id);

  const distinctIdMap = new Map<string, string[]>();
  for (const row of distinctIdRows) {
    distinctIdMap.set(row.person_id, row.distinct_ids);
  }

  return personRows.map((p) => ({
    ...p,
    properties: p.properties as Record<string, unknown>,
    distinct_ids: distinctIdMap.get(p.id) ?? [],
  })) as PersonRow[];
}
