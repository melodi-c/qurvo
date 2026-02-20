import { readFileSync } from 'fs';
import { join } from 'path';
import type { ClickHouseClient } from '@shot/clickhouse';

export async function applyClickHouseMigration(
  ch: ClickHouseClient,
  user: string,
  password: string,
): Promise<void> {
  // __dirname = packages/@shot/testing/src
  // target   = packages/@shot/clickhouse/src/migration.sql
  const migrationPath = join(__dirname, '..', '..', 'clickhouse', 'src', 'migration.sql');
  const raw = readFileSync(migrationPath, 'utf-8');

  const sql = raw
    .replace(/\$\{CLICKHOUSE_USER\}/g, user)
    .replace(/\$\{CLICKHOUSE_PASSWORD\}/g, password);

  const statements = sql.split(/;[ \t]*\n/).map((s) => s.trim()).filter((s) => s.length > 0);

  for (const statement of statements) {
    await ch.command({ query: statement });
  }
}
