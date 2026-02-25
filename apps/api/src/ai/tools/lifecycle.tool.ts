import { Injectable, Inject } from '@nestjs/common';
import { z } from 'zod';
import { LIFECYCLE_SERVICE } from '../../analytics/analytics.module';
import type { AnalyticsQueryService } from '../../analytics/analytics-query.factory';
import type { LifecycleQueryParams, LifecycleQueryResult } from '../../analytics/lifecycle/lifecycle.query';
import { defineTool } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';

const argsSchema = z.object({
  target_event: z.string().describe('Event to analyze lifecycle for'),
  granularity: z.enum(['day', 'week', 'month']).describe('Period granularity'),
  date_from: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
  date_to: z.string().describe('End date in ISO format (YYYY-MM-DD)'),
});

const tool = defineTool({
  name: 'query_lifecycle',
  description:
    'Query user lifecycle stages — categorizes users into new, returning, resurrecting, and dormant over time.',
  schema: argsSchema,
  visualizationType: 'lifecycle_chart',
});

@Injectable()
export class LifecycleTool implements AiTool {
  readonly name = tool.name;
  readonly cacheable = true;

  constructor(@Inject(LIFECYCLE_SERVICE) private readonly lifecycleService: AnalyticsQueryService<LifecycleQueryParams, LifecycleQueryResult>) {}

  definition() { return tool.definition; }

  run = tool.createRun(async (args, userId, projectId) => {
    const result = await this.lifecycleService.query({ project_id: projectId, ...args });
    return result.data;
  });
}
