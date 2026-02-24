import { Injectable, Inject } from '@nestjs/common';
import { z } from 'zod';
import { FUNNEL_SERVICE } from '../../analytics/analytics.module';
import type { AnalyticsQueryService } from '../../analytics/analytics-query.factory';
import type { FunnelQueryParams, FunnelQueryResult } from '../../analytics/funnel/funnel.query';
import { defineTool, propertyFilterSchema } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';

const argsSchema = z.object({
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

const tool = defineTool({
  name: 'query_funnel',
  description:
    'Query conversion funnel with multiple steps. Returns conversion rates, drop-offs, and average time between steps. Supports per-step filters.',
  schema: argsSchema,
  visualizationType: 'funnel_chart',
});

@Injectable()
export class FunnelTool implements AiTool {
  readonly name = tool.name;

  constructor(@Inject(FUNNEL_SERVICE) private readonly funnelService: AnalyticsQueryService<FunnelQueryParams, FunnelQueryResult>) {}

  definition() { return tool.definition; }

  run = tool.createRun(async (args, userId, projectId) => {
    const result = await this.funnelService.query(userId, {
      project_id: projectId,
      conversion_window_days: args.conversion_window_days ?? 14,
      ...args,
    });
    return result.data;
  });
}
