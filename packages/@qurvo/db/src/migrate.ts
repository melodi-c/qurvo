import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { join } from 'path';

async function main() {
  const url = process.env.DATABASE_URL || 'postgresql://qurvo:qurvo_secret@localhost:5432/qurvo_analytics';
  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool);

  const migrationsFolder = join(__dirname, '..', 'drizzle');
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder });
  console.log('Migrations complete.');

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
