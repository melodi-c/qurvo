import { Injectable, Inject } from '@nestjs/common';
import { z } from 'zod';
import { CLICKHOUSE } from '../../providers/clickhouse.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { defineTool, propertyFilterSchema } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';
import { buildPropertyFilterConditions } from '../../utils/property-filter';

const argsSchema = z.object({
  filters: z.array(propertyFilterSchema).nullish().describe(
    'Optional filters to narrow down persons by property values. ' +
    'Use "user_properties.<key>" for person/user properties (e.g. "user_properties.plan"), ' +
    'or "properties.<key>" for event properties (e.g. "properties.browser"), ' +
    'or direct columns like "browser", "country", "device_type".',
  ),
  event_name: z.string().nullish().describe(
    'Optional: only include persons who performed this specific event.',
  ),
  date_from: z.string().nullish().describe(
    'Start of date range in YYYY-MM-DD format. Filters event activity within this window.',
  ),
  date_to: z.string().nullish().describe(
    'End of date range in YYYY-MM-DD format. Filters event activity within this window.',
  ),
  order_by: z.enum(['event_count', 'last_seen', 'first_seen']).nullish().describe(
    'Sort order for results. Defaults to "event_count" (most active users first).',
  ),
  limit: z.number().int().min(1).max(25).nullish().describe(
    'Maximum number of persons to return. Default: 10, max: 25.',
  ),
});

const tool = defineTool({
  name: 'query_persons',
  description:
    'Find and list users matching specific criteria. Returns person_id, key user properties, event count, ' +
    'first seen, and last seen timestamps. Use this to answer questions like "who are the most active users?", ' +
    '"show me users who signed up last week", or "find users with browser=Chrome".',
  schema: argsSchema,
});

const MAX_STRING_LENGTH = 60;

function truncateStringValue(value: unknown): unknown {
  if (typeof value === 'string' && value.length > MAX_STRING_LENGTH) {
    return value.slice(0, MAX_STRING_LENGTH) + '…';
  }
  return value;
}

function truncateUserProperties(props: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(props)) {
    result[key] = truncateStringValue(val);
  }
  return result;
}

interface PersonRow {
  person_id: string;
  user_properties: Record<string, unknown>;
  event_count: number;
  first_seen: string;
  last_seen: string;
}

@Injectable()
export class QueryPersonsTool implements AiTool {
  readonly name = tool.name;

  constructor(
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
  ) {}

  definition() { return tool.definition; }

  run = tool.createRun(async (args, _userId, projectId) => {
    const limit = Math.min(args.limit ?? 10, 25);
    const orderBy = args.order_by ?? 'event_count';

    const params: Record<string, unknown> = { project_id: projectId, limit };
    const whereClauses: string[] = ['project_id = {project_id:UUID}'];

    if (args.event_name) {
      params['event_name'] = args.event_name;
      whereClauses.push('event_name = {event_name:String}');
    }

    if (args.date_from) {
      params['date_from'] = args.date_from;
      whereClauses.push('timestamp >= parseDateTimeBestEffort({date_from:String})');
    }

    if (args.date_to) {
      params['date_to'] = args.date_to;
      whereClauses.push('timestamp < parseDateTimeBestEffort({date_to:String}) + INTERVAL 1 DAY');
    }

    if (args.filters?.length) {
      const filterConditions = buildPropertyFilterConditions(args.filters, 'pf', params);
      whereClauses.push(...filterConditions);
    }

    const orderExpr =
      orderBy === 'event_count' ? 'event_count DESC' :
      orderBy === 'last_seen' ? 'last_seen DESC' :
      'first_seen DESC';

    const sql = `
      SELECT
        toString(person_id) AS person_id,
        argMax(user_properties, timestamp) AS user_properties,
        count() AS event_count,
        formatDateTime(min(timestamp), '%Y-%m-%dT%H:%i:%S.000Z', 'UTC') AS first_seen,
        formatDateTime(max(timestamp), '%Y-%m-%dT%H:%i:%S.000Z', 'UTC') AS last_seen
      FROM events
      WHERE ${whereClauses.join('\n        AND ')}
      GROUP BY person_id
      ORDER BY ${orderExpr}
      LIMIT {limit:UInt32}
    `;

    const res = await this.ch.query({ query: sql, query_params: params, format: 'JSONEachRow' });
    const rows = await res.json<{ person_id: string; user_properties: string | Record<string, unknown>; event_count: string | number; first_seen: string; last_seen: string }>();

    const persons: PersonRow[] = rows.map((r) => {
      const rawProps: Record<string, unknown> = typeof r.user_properties === 'string'
        ? (JSON.parse(r.user_properties) as Record<string, unknown>)
        : (r.user_properties);
      return {
        person_id: r.person_id,
        user_properties: truncateUserProperties(rawProps),
        event_count: typeof r.event_count === 'string' ? parseInt(r.event_count, 10) : r.event_count,
        first_seen: r.first_seen,
        last_seen: r.last_seen,
      };
    });

    return {
      persons,
      total_returned: persons.length,
      order_by: orderBy,
    };
  });
}
