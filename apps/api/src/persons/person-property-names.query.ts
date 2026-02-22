import { sql } from 'drizzle-orm';
import { persons, type Database } from '@qurvo/db';

export async function queryPersonPropertyNames(
  db: Database,
  projectId: string,
): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT DISTINCT jsonb_object_keys(${persons.properties}) AS key
    FROM ${persons}
    WHERE ${persons.project_id} = ${projectId}
    ORDER BY key
    LIMIT 500
  `);

  return result.map((r) => String(r.key));
}
