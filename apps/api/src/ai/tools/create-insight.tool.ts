import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { SavedInsightsService } from '../../saved-insights/saved-insights.service';
import { defineTool, propertyFilterSchema } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';
import type { InsightConfig, InsightType } from '@qurvo/db';
import { INSIGHT_TYPE_SLUGS } from '../../constants';

const trendParamsSchema = z.object({
  type: z.literal('trend'),
  series: z.array(z.object({
    event_name: z.string().describe('Name of the event to track'),
    label: z.string().describe('Display label for this series'),
    filters: z.array(propertyFilterSchema).optional().describe('Optional filters to narrow down events by property values'),
  })).min(1).max(5).describe('Event series to query'),
  metric: z.enum(['total_events', 'unique_users', 'events_per_user']).describe('Aggregation metric'),
  granularity: z.enum(['hour', 'day', 'week', 'month']).describe('Time bucket granularity'),
  date_from: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
  date_to: z.string().describe('End date in ISO format (YYYY-MM-DD)'),
  breakdown_property: z.string().optional().describe('Optional event property to break down by'),
  compare: z.boolean().optional().describe('Whether to compare with the previous period'),
});

const funnelParamsSchema = z.object({
  type: z.literal('funnel'),
  steps: z.array(z.object({
    event_name: z.string().describe('Event name for this funnel step'),
    label: z.string().describe('Display label for this step'),
    filters: z.array(propertyFilterSchema).optional().describe('Optional filters to narrow down events by property values'),
  })).min(2).max(10).describe('Ordered funnel steps'),
  conversion_window_days: z.number().min(1).max(90).optional().describe('Max days allowed for conversion (1-90). Default: 14'),
  date_from: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
  date_to: z.string().describe('End date in ISO format (YYYY-MM-DD)'),
  breakdown_property: z.string().optional().describe('Optional property to break down by'),
});

const retentionParamsSchema = z.object({
  type: z.literal('retention'),
  target_event: z.string().describe('Event to track retention for'),
  retention_type: z.enum(['first_time', 'recurring']).describe('first_time = cohort by first event; recurring = any repeat'),
  granularity: z.enum(['day', 'week', 'month']).describe('Period granularity'),
  periods: z.number().min(1).max(30).optional().describe('Number of periods to show (1-30). Default: 11'),
  date_from: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
  date_to: z.string().describe('End date in ISO format (YYYY-MM-DD)'),
});

const lifecycleParamsSchema = z.object({
  type: z.literal('lifecycle'),
  target_event: z.string().describe('Event to analyze lifecycle for'),
  granularity: z.enum(['day', 'week', 'month']).describe('Period granularity'),
  date_from: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
  date_to: z.string().describe('End date in ISO format (YYYY-MM-DD)'),
});

const stickinessParamsSchema = z.object({
  type: z.literal('stickiness'),
  target_event: z.string().describe('Event to analyze stickiness for'),
  granularity: z.enum(['day', 'week', 'month']).describe('Period granularity'),
  date_from: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
  date_to: z.string().describe('End date in ISO format (YYYY-MM-DD)'),
});

const pathsParamsSchema = z.object({
  type: z.literal('paths'),
  date_from: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
  date_to: z.string().describe('End date in ISO format (YYYY-MM-DD)'),
  step_limit: z.number().int().min(3).max(10).optional().describe('Maximum number of steps in the path (3-10, default 5)'),
  start_event: z.string().optional().describe('Anchor start point — only show paths starting from this event'),
  end_event: z.string().optional().describe('Anchor end point — only show paths ending at this event'),
  exclusions: z.array(z.string()).optional().describe('Event names to exclude from paths'),
  min_persons: z.number().int().min(1).optional().describe('Minimum person count per transition (default 1)'),
});

const argsSchema = z.object({
  name: z.string().min(1).max(200).describe('Insight title'),
  description: z.string().max(1000).optional().describe('Optional description of what this insight shows'),
  query_params: z.discriminatedUnion('type', [
    trendParamsSchema,
    funnelParamsSchema,
    retentionParamsSchema,
    lifecycleParamsSchema,
    stickinessParamsSchema,
    pathsParamsSchema,
  ]).describe('The full query parameters used to produce the result — same object passed to the corresponding query tool, with an added "type" field indicating the insight type'),
});

const tool = defineTool({
  name: 'create_insight',
  description:
    'Save a query result as a persistent insight so the user can revisit it later. ' +
    'Call this after running a query tool when the user asks to save or bookmark the result. ' +
    'Returns the insight ID and a navigation link.',
  schema: argsSchema,
});

@Injectable()
export class CreateInsightTool implements AiTool {
  readonly name = tool.name;

  constructor(private readonly savedInsightsService: SavedInsightsService) {}

  definition() { return tool.definition; }

  run = tool.createRun(async (args, userId, projectId) => {
    const { type, ...params } = args.query_params;
    const config = { type, ...params } as InsightConfig;

    const insight = await this.savedInsightsService.create(userId, projectId, {
      type: type as InsightType,
      name: args.name,
      description: args.description,
      config,
    });

    return {
      insight_id: insight.id,
      name: insight.name,
      type: insight.type,
      link: `/insights/${INSIGHT_TYPE_SLUGS[insight.type]}/${insight.id}`,
    };
  });
}
