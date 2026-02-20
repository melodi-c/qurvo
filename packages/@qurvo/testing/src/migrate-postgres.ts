import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { join } from 'path';

export async function applyPostgresMigration(connectionString: string): Promise<void> {
  // __dirname = packages/@qurvo/testing/src
  // target   = packages/@qurvo/db/drizzle
  const migrationsFolder = join(__dirname, '..', '..', 'db', 'drizzle');
  const sql = (postgres as any)(connectionString, { max: 1 });
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder });
  await sql.end();
}
