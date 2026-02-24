import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export function createDb(url?: string) {
  const connectionString = url || process.env.DATABASE_URL || 'postgresql://qurvo:qurvo_secret@localhost:5432/qurvo_analytics';
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}

export type Database = ReturnType<typeof createDb>;
