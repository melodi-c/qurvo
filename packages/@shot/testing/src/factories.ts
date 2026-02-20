import { randomUUID, randomBytes, createHash } from 'crypto';
import type { Database } from '@shot/db';
import { users, projects, apiKeys, projectMembers } from '@shot/db';
import type { ClickHouseClient, Event } from '@shot/clickhouse';

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

export async function insertTestEvents(ch: ClickHouseClient, events: Event[]): Promise<void> {
  await ch.insert({
    table: 'events',
    values: events.map(e => ({
      event_id: e.event_id,
      project_id: e.project_id,
      event_name: e.event_name,
      event_type: e.event_type,
      distinct_id: e.distinct_id,
      person_id: e.person_id,
      timestamp: e.timestamp,
      properties: e.properties ?? '{}',
      user_properties: e.user_properties ?? '{}',
      browser: e.browser ?? '',
      country: e.country ?? '',
      region: e.region ?? '',
      city: e.city ?? '',
      device_type: e.device_type ?? '',
      os: e.os ?? '',
      os_version: e.os_version ?? '',
      language: e.language ?? '',
      url: e.url ?? '',
      referrer: e.referrer ?? '',
      page_title: e.page_title ?? '',
      page_path: e.page_path ?? '',
    })),
    format: 'JSONEachRow',
    clickhouse_settings: {
      date_time_input_format: 'best_effort',
      async_insert: 0,
    },
  });
}
