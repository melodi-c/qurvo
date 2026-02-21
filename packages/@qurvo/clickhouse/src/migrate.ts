import { createClickHouse } from './client';
import { createHash } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(__dirname, 'migrations');

const BOOTSTRAP_DDL = `
CREATE TABLE IF NOT EXISTS _migrations
(
    name       String,
    checksum   String,
    applied_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree()
ORDER BY name
`.trim();

function applyTemplate(sql: string): string {
  return sql
    .replace(/\$\{CLICKHOUSE_DB\}/g, process.env.CLICKHOUSE_DB || 'qurvo_analytics')
    .replace(/\$\{CLICKHOUSE_USER\}/g, process.env.CLICKHOUSE_USER || 'qurvo')
    .replace(/\$\{CLICKHOUSE_PASSWORD\}/g, process.env.CLICKHOUSE_PASSWORD || 'qurvo_secret');
}

function splitStatements(sql: string): string[] {
  return sql
    .split(/;[ \t]*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function md5(content: string): string {
  return createHash('md5').update(content).digest('hex');
}

async function main() {
  const ch = createClickHouse();

  await ch.command({ query: BOOTSTRAP_DDL });

  const result = await ch.query({
    query: 'SELECT name, checksum FROM _migrations ORDER BY name',
    format: 'JSONEachRow',
  });
  const rows = await result.json<{ name: string; checksum: string }>();
  const applied = new Map(rows.map((r) => [r.name, r.checksum]));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const filename of files) {
    const storedChecksum = applied.get(filename);
    if (storedChecksum) {
      const raw = readFileSync(join(MIGRATIONS_DIR, filename), 'utf-8');
      const currentChecksum = md5(raw);
      if (storedChecksum !== currentChecksum) {
        throw new Error(
          `Checksum mismatch for "${filename}": ` +
          `expected ${storedChecksum}, got ${currentChecksum}. ` +
          `Do not modify already-applied migrations.`,
        );
      }
    }
  }

  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log('ClickHouse migrations: nothing to apply.');
    await ch.close();
    process.exit(0);
  }

  console.log(`ClickHouse migrations: ${pending.length} pending.`);

  for (const filename of pending) {
    const raw = readFileSync(join(MIGRATIONS_DIR, filename), 'utf-8');
    const sql = applyTemplate(raw);
    const checksum = md5(raw);
    const statements = splitStatements(sql);

    console.log(`  Applying ${filename} (${statements.length} statements)...`);

    for (const statement of statements) {
      await ch.command({ query: statement });
    }

    await ch.insert({
      table: '_migrations',
      values: [{ name: filename, checksum }],
      format: 'JSONEachRow',
    });

    console.log(`  Applied ${filename}.`);
  }

  console.log('ClickHouse migrations complete.');
  await ch.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('ClickHouse migration failed:', err);
  process.exit(1);
});
