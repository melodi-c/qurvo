import { eq, and, desc, ilike, sql, type SQL } from 'drizzle-orm';
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

export async function queryPersons(db: Database, params: PersonsQueryParams): Promise<PersonRow[]> {
  const conditions: SQL[] = [eq(persons.project_id, params.project_id)];
  if (params.search) {
    conditions.push(ilike(personDistinctIds.distinct_id, `%${params.search}%`));
  }
  if (params.filters?.length) {
    conditions.push(...buildPgPropertyFilterConditions(params.filters));
  }

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
    .where(and(...conditions))
    .groupBy(persons.id)
    .orderBy(desc(persons.updated_at))
    .limit(params.limit)
    .offset(params.offset);

  return rows as PersonRow[];
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

export async function queryPersonsCount(db: Database, params: PersonsCountParams): Promise<number> {
  const conditions: SQL[] = [eq(persons.project_id, params.project_id)];
  if (params.search) {
    conditions.push(ilike(personDistinctIds.distinct_id, `%${params.search}%`));
  }
  if (params.filters?.length) {
    conditions.push(...buildPgPropertyFilterConditions(params.filters));
  }

  const rows = await db
    .select({ count: sql<string>`count(DISTINCT ${persons.id})` })
    .from(persons)
    .leftJoin(personDistinctIds, eq(personDistinctIds.person_id, persons.id))
    .where(and(...conditions));

  return Number(rows[0]?.count ?? 0);
}
