import { readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(__dirname, 'migrations');

function nextSequence(files: string[]): string {
  const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort();
  if (sqlFiles.length === 0) return '0001';

  const last = sqlFiles[sqlFiles.length - 1];
  const match = last.match(/^(\d+)_/);
  if (!match) return '0001';

  const next = parseInt(match[1], 10) + 1;
  return String(next).padStart(4, '0');
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function main() {
  const rawName = process.argv[2];
  if (!rawName) {
    console.error('Usage: pnpm ch:generate <migration-name>');
    console.error('Example: pnpm ch:generate add_sessions_table');
    process.exit(1);
  }

  const files = readdirSync(MIGRATIONS_DIR);
  const seq = nextSequence(files);
  const slug = slugify(rawName);
  const filename = `${seq}_${slug}.sql`;
  const filepath = join(MIGRATIONS_DIR, filename);

  const template = `-- Migration: ${filename}
-- Created: ${new Date().toISOString()}
--
-- Write your ClickHouse DDL below.
-- Statements are split on ";\\n" — end each statement with a semicolon followed by a newline.
-- Template variables: \${CLICKHOUSE_DB}, \${CLICKHOUSE_USER}, \${CLICKHOUSE_PASSWORD}
--
`;

  writeFileSync(filepath, template, 'utf-8');
  console.log(`Created: src/migrations/${filename}`);
}

main();
