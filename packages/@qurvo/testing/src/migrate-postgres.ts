import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { join } from 'path';

export async function applyPostgresMigration(connectionString: string): Promise<void> {
  // __dirname = packages/@qurvo/testing/src
  // target   = packages/@qurvo/db/drizzle
  const migrationsFolder = join(__dirname, '..', '..', 'db', 'drizzle');
  const pool = new Pool({ connectionString, max: 1 });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder });
  await pool.end();
}
