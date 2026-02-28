import { Injectable, Inject } from '@nestjs/common';
import { z } from 'zod';
import { TREND_SERVICE } from '../../analytics/analytics.module';
import type { AnalyticsQueryService } from '../../analytics/analytics-query.factory';
import type { TrendQueryParams, TrendQueryResult } from '../../analytics/trend/trend.query';
import { defineTool, propertyFilterSchema } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';

const argsSchema = z.object({
  series: z.array(z.object({
    event_name: z.string().describe('Name of the event to track'),
    label: z.string().describe('Display label for this series'),
    filters: z.array(propertyFilterSchema).nullish().describe('Optional filters to narrow down events by property values'),
  })).min(1).max(5).describe('Event series to query'),
  metric: z.enum(['total_events', 'unique_users', 'events_per_user']).describe('Aggregation metric'),
  granularity: z.enum(['hour', 'day', 'week', 'month']).describe('Time bucket granularity. Use day for <60 days, week for 60-180, month for >180'),
  date_from: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
  date_to: z.string().describe('End date in ISO format (YYYY-MM-DD)'),
  breakdown_property: z.string().nullish().describe('Optional event property to break down by'),
  compare: z.boolean().nullish().describe('Whether to compare with the previous period'),
});

const tool = defineTool({
  name: 'query_trend',
  description:
    'Query time-series trend data for events. Returns data points over time with configurable granularity. ' +
    'Supports multiple series, breakdown by property, period comparison, and per-series filters.',
  schema: argsSchema,
  visualizationType: 'trend_chart',
});

@Injectable()
export class TrendTool implements AiTool {
  readonly name = tool.name;
  readonly cacheable = true;

  constructor(@Inject(TREND_SERVICE) private readonly trendService: AnalyticsQueryService<TrendQueryParams, TrendQueryResult>) {}

  definition() { return tool.definition; }

  run = tool.createRun(async (args, userId, projectId) => {
    const result = await this.trendService.query({ project_id: projectId, ...args });
    return result.data;
  });
}
