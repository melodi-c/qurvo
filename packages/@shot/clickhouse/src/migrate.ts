import { createClickHouse } from './client';
import { readFileSync } from 'fs';
import { join } from 'path';

async function main() {
  const ch = createClickHouse();

  const raw = readFileSync(join(__dirname, 'migration.sql'), 'utf-8');
  const sql = raw
    .replace(/\$\{CLICKHOUSE_USER\}/g, process.env.CLICKHOUSE_USER || 'shot')
    .replace(/\$\{CLICKHOUSE_PASSWORD\}/g, process.env.CLICKHOUSE_PASSWORD || 'shot_secret');

  const statements = sql.split(';\n').map((s) => s.trim()).filter((s) => s.length > 0);

  console.log('Running ClickHouse migrations...');
  for (const statement of statements) {
    await ch.command({ query: statement });
  }
  console.log('ClickHouse migrations complete.');

  await ch.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('ClickHouse migration failed:', err);
  process.exit(1);
});
