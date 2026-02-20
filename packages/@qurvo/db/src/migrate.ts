import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { join } from 'path';

async function main() {
  const url = process.env.DATABASE_URL || 'postgresql://qurvo:qurvo_secret@localhost:5432/qurvo_analytics';
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  const migrationsFolder = join(__dirname, '..', 'drizzle');
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder });
  console.log('Migrations complete.');

  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
