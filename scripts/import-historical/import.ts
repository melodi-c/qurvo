import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SSH_HOST = process.env.SSH_HOST || 'root@46.182.24.93';

const CH_URL = 'https://rc1d-g3ks2ld3i0pdmci3.mdb.yandexcloud.net:8443';
const CH_USER = 'analytics_clickhouse';
const CH_PASSWORD = 'mb7mF5PwcXogQJXDK34Q';
const CH_DB = 'analytics';

const IMPORT_API_URL = process.env.IMPORT_API_URL || 'https://ingest.qurvo.ru/v1/import';
const IMPORT_API_KEY = process.env.IMPORT_API_KEY || '4Z_-5DwMBY4a6wg7IjjoSVfsRJM5C3H-';

const BATCH_SIZE = intEnv('BATCH_SIZE', 2000);
const CH_PAGE_SIZE = intEnv('CH_PAGE_SIZE', 10000);
const CONCURRENCY = intEnv('CONCURRENCY', 3);

const CURSOR_FILE = path.join(import.meta.dirname, '.cursor.json');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RemoteEvent {
  event_id: string;
  distinct_id: string;
  event_name: string;
  page_url: string | null;
  session_id: string | null;
  created_at: string;
  ingested_at: string;
}

interface Cursor {
  created_at: string;
  event_id: string;
  total_sent: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function intEnv(name: string, defaultVal: number): number {
  const val = process.env[name];
  return val ? parseInt(val, 10) : defaultVal;
}

function loadCursor(): Cursor | null {
  if (!fs.existsSync(CURSOR_FILE)) return null;
  return JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf8'));
}

function saveCursor(cursor: Cursor): void {
  fs.writeFileSync(CURSOR_FILE, JSON.stringify(cursor, null, 2));
}

// ---------------------------------------------------------------------------
// Remote ClickHouse query via SSH
// ---------------------------------------------------------------------------

function queryRemoteCH(query: string): RemoteEvent[] {
  const chParams = `user=${CH_USER}&password=${CH_PASSWORD}&database=${CH_DB}&default_format=JSONEachRow`;
  const escapedQuery = query.replace(/'/g, "'\\''");
  const cmd = `ssh ${SSH_HOST} "curl -sk '${CH_URL}/?${chParams}' --data-binary '${escapedQuery}'"`;

  const output = execSync(cmd, { maxBuffer: 100 * 1024 * 1024, timeout: 120_000 }).toString().trim();
  if (!output) return [];

  return output.split('\n').map((line) => JSON.parse(line));
}

// ---------------------------------------------------------------------------
// Fetch page from remote CH with keyset pagination
// ORDER BY (created_at, event_id) matches primary key for fast scans
// ---------------------------------------------------------------------------

function fetchPage(cursor: Cursor | null): RemoteEvent[] {
  let whereClause = '';
  if (cursor) {
    whereClause = `WHERE (created_at, event_id) > ('${cursor.created_at}', '${cursor.event_id}')`;
  }

  const query = `SELECT event_id, distinct_id, event_name, properties.page_url AS page_url, properties.session_id AS session_id, created_at, ingested_at FROM events ${whereClause} ORDER BY created_at, event_id LIMIT ${CH_PAGE_SIZE}`;

  return queryRemoteCH(query);
}

// ---------------------------------------------------------------------------
// Map remote event to import API format
// ---------------------------------------------------------------------------

function mapEvent(raw: RemoteEvent): Record<string, unknown> {
  const context: Record<string, unknown> = {};
  if (raw.page_url) context.url = raw.page_url;
  if (raw.session_id) context.session_id = raw.session_id;

  return {
    event: raw.event_name,
    distinct_id: raw.distinct_id,
    event_id: raw.event_id,
    timestamp: new Date(raw.ingested_at + 'Z').toISOString(),
    properties: {},
    context,
  };
}

// ---------------------------------------------------------------------------
// Send batch to import API
// ---------------------------------------------------------------------------

async function sendBatch(events: Record<string, unknown>[]): Promise<void> {
  const resp = await fetch(IMPORT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': IMPORT_API_KEY,
    },
    body: JSON.stringify({ events }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Import API error (${resp.status}): ${text}`);
  }
}

// ---------------------------------------------------------------------------
// Concurrency-limited batch sender
// ---------------------------------------------------------------------------

async function sendWithConcurrency(
  batches: Record<string, unknown>[][],
  concurrency: number,
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  let idx = 0;

  async function worker() {
    while (idx < batches.length) {
      const batchIdx = idx++;
      const batch = batches[batchIdx];
      try {
        await sendBatch(batch);
        ok += batch.length;
      } catch (err) {
        failed += batch.length;
        console.error(`  Batch ${batchIdx} failed:`, (err as Error).message);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, batches.length) }, () => worker());
  await Promise.all(workers);
  return { ok, failed };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Import historical events ===');
  console.log(`SSH: ${SSH_HOST}`);
  console.log(`Import API: ${IMPORT_API_URL}`);
  console.log(`Batch: ${BATCH_SIZE} | CH page: ${CH_PAGE_SIZE} | Concurrency: ${CONCURRENCY}`);

  let cursor = loadCursor();
  if (cursor) {
    console.log(`Resuming: created_at=${cursor.created_at}, event_id=${cursor.event_id}, sent=${cursor.total_sent}`);
  } else {
    console.log('Starting from the beginning');
  }

  let totalSent = cursor?.total_sent ?? 0;
  let totalFailed = 0;
  const startTime = Date.now();

  while (true) {
    const page = fetchPage(cursor);
    if (page.length === 0) {
      console.log('No more events. Done!');
      break;
    }

    const mapped = page.map(mapEvent);

    // Split into batches for the import API
    const batches: Record<string, unknown>[][] = [];
    for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
      batches.push(mapped.slice(i, i + BATCH_SIZE));
    }

    const { ok, failed } = await sendWithConcurrency(batches, CONCURRENCY);
    totalSent += ok;
    totalFailed += failed;

    // Update cursor to last event in page (keyset by primary key)
    const lastEvent = page[page.length - 1];
    cursor = {
      created_at: lastEvent.created_at,
      event_id: lastEvent.event_id,
      total_sent: totalSent,
    };
    saveCursor(cursor);

    const elapsed = (Date.now() - startTime) / 1000;
    const speed = elapsed > 0 ? Math.round(totalSent / elapsed) : 0;
    console.log(
      `Sent: ${totalSent} | Failed: ${totalFailed} | Speed: ${speed} ev/s | Page: ${page.length} | Last ingested: ${lastEvent.ingested_at}`,
    );
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nDone! Sent: ${totalSent} | Failed: ${totalFailed} | Time: ${Math.round(elapsed)}s`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
