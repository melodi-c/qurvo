import { sql } from 'drizzle-orm';
import { persons, type Database } from '@qurvo/db';

export interface PersonPropertyValueRow {
  value: string;
  count: number;
}

export interface PersonPropertyValuesParams {
  project_id: string;
  property_name: string;
  limit?: number;
}

export async function queryPersonPropertyValues(
  db: Database,
  params: PersonPropertyValuesParams,
): Promise<PersonPropertyValueRow[]> {
  const limit = params.limit ?? 50;

  const result = await db.execute(sql`
    SELECT
      (${persons.properties} ->> ${params.property_name}) AS value,
      count(*)::int AS count
    FROM ${persons}
    WHERE ${persons.project_id} = ${params.project_id}
      AND ${persons.properties} ? ${params.property_name}
      AND (${persons.properties} ->> ${params.property_name}) IS NOT NULL
      AND (${persons.properties} ->> ${params.property_name}) != ''
    GROUP BY value
    ORDER BY count DESC
    LIMIT ${limit}
  `);

  return result.rows.map((r) => ({
    value: String(r.value),
    count: Number(r.count),
  }));
}
