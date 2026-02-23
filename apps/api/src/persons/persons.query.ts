import { eq, and, desc, sql, inArray, type SQL } from 'drizzle-orm';
import { persons, personDistinctIds, type Database } from '@qurvo/db';
import { buildPgPropertyFilterConditions, type PersonPropertyFilter } from '../utils/pg-property-filter';

export interface PersonsQueryParams {
  project_id: string;
  search?: string;
  filters?: PersonPropertyFilter[];
  limit: number;
  offset: number;
}

export interface PersonRow {
  id: string;
  project_id: string;
  properties: Record<string, unknown>;
  distinct_ids: string[];
  created_at: Date;
  updated_at: Date;
}

export interface PersonsCountParams {
  project_id: string;
  search?: string;
  filters?: PersonPropertyFilter[];
}

/**
 * Two-step query: first fetch person rows via index scan (no JOIN),
 * then fetch distinct_ids only for the found persons.
 */
export async function queryPersons(db: Database, params: PersonsQueryParams): Promise<PersonRow[]> {
  // Step A: fetch person rows with index scan
  const conditions: SQL[] = [eq(persons.project_id, params.project_id)];

  if (params.search) {
    // Subquery: find person_ids matching the search term
    conditions.push(
      sql`${persons.id} IN (SELECT ${personDistinctIds.person_id} FROM ${personDistinctIds} WHERE ${personDistinctIds.project_id} = ${params.project_id} AND ${personDistinctIds.distinct_id} ILIKE ${`%${params.search}%`})`,
    );
  }

  if (params.filters?.length) {
    conditions.push(...buildPgPropertyFilterConditions(params.filters));
  }

  const personRows = await db
    .select({
      id: persons.id,
      project_id: persons.project_id,
      properties: persons.properties,
      created_at: persons.created_at,
      updated_at: persons.updated_at,
    })
    .from(persons)
    .where(and(...conditions))
    .orderBy(desc(persons.updated_at))
    .limit(params.limit)
    .offset(params.offset);

  if (personRows.length === 0) {
    return [];
  }

  // Step B: fetch distinct_ids only for the found persons
  const personIds = personRows.map((r) => r.id);
  const distinctIdRows = await db
    .select({
      person_id: personDistinctIds.person_id,
      distinct_ids: sql<string[]>`array_agg(${personDistinctIds.distinct_id} ORDER BY ${personDistinctIds.created_at})`,
    })
    .from(personDistinctIds)
    .where(inArray(personDistinctIds.person_id, personIds))
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

export async function queryPersonById(
  db: Database,
  projectId: string,
  personId: string,
): Promise<PersonRow | null> {
  const rows = await db
    .select({
      id: persons.id,
      project_id: persons.project_id,
      properties: persons.properties,
      created_at: persons.created_at,
      updated_at: persons.updated_at,
      distinct_ids: sql<string[]>`array_remove(array_agg(${personDistinctIds.distinct_id} ORDER BY ${personDistinctIds.created_at}), NULL)`,
    })
    .from(persons)
    .leftJoin(personDistinctIds, eq(personDistinctIds.person_id, persons.id))
    .where(and(eq(persons.id, personId), eq(persons.project_id, projectId)))
    .groupBy(persons.id)
    .limit(1);

  return (rows[0] as PersonRow | undefined) ?? null;
}

/**
 * Optimized count: no JOIN when no search is needed.
 */
export async function queryPersonsCount(db: Database, params: PersonsCountParams): Promise<number> {
  const conditions: SQL[] = [eq(persons.project_id, params.project_id)];

  if (params.search) {
    conditions.push(
      sql`${persons.id} IN (SELECT ${personDistinctIds.person_id} FROM ${personDistinctIds} WHERE ${personDistinctIds.project_id} = ${params.project_id} AND ${personDistinctIds.distinct_id} ILIKE ${`%${params.search}%`})`,
    );
  }

  if (params.filters?.length) {
    conditions.push(...buildPgPropertyFilterConditions(params.filters));
  }

  const rows = await db
    .select({ count: sql<string>`count(*)` })
    .from(persons)
    .where(and(...conditions));

  return Number(rows[0]?.count ?? 0);
}
