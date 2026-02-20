import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export function createDb(url?: string) {
  const connectionString = url || process.env.DATABASE_URL || 'postgresql://qurvo:qurvo_secret@localhost:5432/qurvo_analytics';
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;
