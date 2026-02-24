import { randomUUID, randomBytes, createHash } from 'crypto';
import type { Database } from '@qurvo/db';
import { users, projects, apiKeys, projectMembers } from '@qurvo/db';
import type { ClickHouseClient, Event } from '@qurvo/clickhouse';

export interface TestProject {
  projectId: string;
  userId: string;
  apiKeyId: string;
  apiKey: string;
  apiKeyHash: string;
}

export async function createTestProject(db: Database): Promise<TestProject> {
  const projectId = randomUUID();
  const userId = randomUUID();
  const apiKeyId = randomUUID();

  const rawKey = `test_${randomBytes(24).toString('hex')}`;
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, 8);
  const slug = `test-project-${randomBytes(4).toString('hex')}`;

  await db.insert(users).values({
    id: userId,
    email: `test-${userId}@example.com`,
    password_hash: 'not_used_in_tests',
    display_name: 'Test User',
  } as any);

  await db.insert(projects).values({
    id: projectId,
    name: 'Test Project',
    slug,
  } as any);

  await db.insert(projectMembers).values({
    project_id: projectId,
    user_id: userId,
    role: 'owner',
  } as any);

  await db.insert(apiKeys).values({
    id: apiKeyId,
    project_id: projectId,
    name: 'Test Key',
    key_prefix: keyPrefix,
    key_hash: keyHash,
    scopes: [],
  } as any);

  return { projectId, userId, apiKeyId, apiKey: rawKey, apiKeyHash: keyHash };
}

export function buildEvent(overrides: Partial<Event> & { project_id: string; person_id: string }): Event {
  return {
    event_id: randomUUID(),
    event_name: 'test_event',
    event_type: 'track',
    distinct_id: overrides.person_id,
    timestamp: new Date().toISOString(),
    properties: '{}',
    user_properties: '{}',
    ...overrides,
  };
}

const OPTIONAL_STRING_DEFAULTS: Record<string, string> = {
  properties: '{}',
  user_properties: '{}',
  browser: '',
  country: '',
  region: '',
  city: '',
  device_type: '',
  os: '',
  os_version: '',
  language: '',
  url: '',
  referrer: '',
  page_title: '',
  page_path: '',
};

export async function insertTestEvents(ch: ClickHouseClient, events: Event[]): Promise<void> {
  await ch.insert({
    table: 'events',
    values: events.map((e) => ({ ...OPTIONAL_STRING_DEFAULTS, ...e })),
    format: 'JSONEachRow',
    clickhouse_settings: {
      async_insert: 0,
      date_time_input_format: 'best_effort',
    },
  });
}
