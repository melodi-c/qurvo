import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { TrendService } from '../../trend/trend.service';
import { defineTool, propertyFilterSchema } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';

const argsSchema = z.object({
  series: z.array(z.object({
    event_name: z.string().describe('Name of the event to track'),
    label: z.string().describe('Display label for this series'),
    filters: z.array(propertyFilterSchema).optional().describe('Optional filters to narrow down events by property values'),
  })).min(1).max(5).describe('Event series to query'),
  metric: z.enum(['total_events', 'unique_users', 'events_per_user']).describe('Aggregation metric'),
  granularity: z.enum(['hour', 'day', 'week', 'month']).describe('Time bucket granularity. Use day for <60 days, week for 60-180, month for >180'),
  date_from: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
  date_to: z.string().describe('End date in ISO format (YYYY-MM-DD)'),
  breakdown_property: z.string().optional().describe('Optional event property to break down by'),
  compare: z.boolean().optional().describe('Whether to compare with the previous period'),
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

  constructor(private readonly trendService: TrendService) {}

  definition() { return tool.definition; }

  run = tool.createRun(async (args, userId, projectId) => {
    const result = await this.trendService.getTrend(userId, { project_id: projectId, ...args });
    return result.data;
  });
}
