import { Injectable, Inject } from '@nestjs/common';
import { z } from 'zod';
import { RETENTION_SERVICE } from '../../analytics/analytics.module';
import type { AnalyticsQueryService } from '../../analytics/analytics-query.factory';
import type { RetentionQueryParams, RetentionQueryResult } from '../../analytics/retention/retention.query';
import { defineTool } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';

const argsSchema = z.object({
  target_event: z.string().describe('Event to track retention for'),
  retention_type: z.enum(['first_time', 'recurring']).describe('first_time = cohort by first event; recurring = any repeat'),
  granularity: z.enum(['day', 'week', 'month']).describe('Period granularity'),
  periods: z.number().min(1).max(30).optional().describe('Number of periods to show (1-30). Default: 11'),
  date_from: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
  date_to: z.string().describe('End date in ISO format (YYYY-MM-DD)'),
});

const tool = defineTool({
  name: 'query_retention',
  description:
    'Query user retention — how many users return to perform an event over time periods after their first occurrence.',
  schema: argsSchema,
  visualizationType: 'retention_chart',
});

@Injectable()
export class RetentionTool implements AiTool {
  readonly name = tool.name;

  constructor(@Inject(RETENTION_SERVICE) private readonly retentionService: AnalyticsQueryService<RetentionQueryParams, RetentionQueryResult>) {}

  definition() { return tool.definition; }

  run = tool.createRun(async (args, userId, projectId) => {
    const result = await this.retentionService.query({
      project_id: projectId,
      periods: args.periods ?? 11,
      ...args,
    });
    return result.data;
  });
}
