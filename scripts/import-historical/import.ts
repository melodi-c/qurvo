import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const REMOTE_CH_URL = requiredEnv('REMOTE_CH_URL');
const REMOTE_CH_USER = requiredEnv('REMOTE_CH_USER');
const REMOTE_CH_PASSWORD = requiredEnv('REMOTE_CH_PASSWORD');
const REMOTE_CH_DB = requiredEnv('REMOTE_CH_DB');

const IMPORT_API_URL = requiredEnv('IMPORT_API_URL'); // e.g. https://ingest.qurvo.io/v1/import
const IMPORT_API_KEY = requiredEnv('IMPORT_API_KEY');

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
  properties: string; // JSON string
  ingested_at: string;
}

interface Cursor {
  ingested_at: string;
  event_id: string;
  total_sent: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requiredEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return val;
}

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
// Remote ClickHouse query
// ---------------------------------------------------------------------------

async function queryRemoteCH(query: string): Promise<RemoteEvent[]> {
  const url = new URL(REMOTE_CH_URL);
  url.searchParams.set('user', REMOTE_CH_USER);
  url.searchParams.set('password', REMOTE_CH_PASSWORD);
  url.searchParams.set('database', REMOTE_CH_DB);
  url.searchParams.set('default_format', 'JSONEachRow');

  const resp = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: query,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ClickHouse query failed (${resp.status}): ${text}`);
  }

  const text = await resp.text();
  if (!text.trim()) return [];

  return text
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}

// ---------------------------------------------------------------------------
// Fetch page from remote CH with keyset pagination
// ---------------------------------------------------------------------------

async function fetchPage(cursor: Cursor | null): Promise<RemoteEvent[]> {
  let whereClause = '';
  if (cursor) {
    whereClause = `WHERE (ingested_at, event_id) > ('${cursor.ingested_at}', '${cursor.event_id}')`;
  }

  const query = `
    SELECT event_id, distinct_id, event_name, properties, ingested_at
    FROM events
    ${whereClause}
    ORDER BY ingested_at ASC, event_id ASC
    LIMIT ${CH_PAGE_SIZE}
  `;

  return queryRemoteCH(query);
}

// ---------------------------------------------------------------------------
// Map remote event to import API format
// ---------------------------------------------------------------------------

function mapEvent(raw: RemoteEvent): Record<string, unknown> {
  let props: Record<string, unknown> = {};
  try {
    props = typeof raw.properties === 'string' ? JSON.parse(raw.properties) : raw.properties;
  } catch {
    // ignore malformed JSON
  }

  const { page_url, session_id, ...restProps } = props as Record<string, unknown>;

  const context: Record<string, unknown> = {};
  if (page_url) context.url = String(page_url);
  if (session_id) context.session_id = String(session_id);

  return {
    event: raw.event_name,
    distinct_id: raw.distinct_id,
    event_id: raw.event_id,
    timestamp: new Date(raw.ingested_at).toISOString(),
    properties: restProps,
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
        console.error(`Batch ${batchIdx} failed:`, (err as Error).message);
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
  console.log('Import historical events');
  console.log(`Remote CH: ${REMOTE_CH_URL} (db: ${REMOTE_CH_DB})`);
  console.log(`Import API: ${IMPORT_API_URL}`);
  console.log(`Batch size: ${BATCH_SIZE}, CH page size: ${CH_PAGE_SIZE}, Concurrency: ${CONCURRENCY}`);

  let cursor = loadCursor();
  if (cursor) {
    console.log(`Resuming from cursor: ingested_at=${cursor.ingested_at}, event_id=${cursor.event_id}, total_sent=${cursor.total_sent}`);
  } else {
    console.log('Starting from the beginning');
  }

  let totalSent = cursor?.total_sent ?? 0;
  let totalFailed = 0;
  const startTime = Date.now();

  while (true) {
    const page = await fetchPage(cursor);
    if (page.length === 0) {
      console.log('No more events to import. Done!');
      break;
    }

    const mapped = page.map(mapEvent);

    // Split into batches
    const batches: Record<string, unknown>[][] = [];
    for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
      batches.push(mapped.slice(i, i + BATCH_SIZE));
    }

    const { ok, failed } = await sendWithConcurrency(batches, CONCURRENCY);
    totalSent += ok;
    totalFailed += failed;

    // Update cursor to last event in page
    const lastEvent = page[page.length - 1];
    cursor = {
      ingested_at: lastEvent.ingested_at,
      event_id: lastEvent.event_id,
      total_sent: totalSent,
    };
    saveCursor(cursor);

    const elapsed = (Date.now() - startTime) / 1000;
    const speed = Math.round(totalSent / elapsed);
    console.log(
      `Sent: ${totalSent} | Failed: ${totalFailed} | Speed: ${speed} events/s | Last: ${cursor.ingested_at}`,
    );
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nImport complete. Total sent: ${totalSent}, Failed: ${totalFailed}, Time: ${Math.round(elapsed)}s`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
