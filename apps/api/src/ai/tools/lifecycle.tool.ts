import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { LifecycleService } from '../../lifecycle/lifecycle.service';
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

  constructor(private readonly lifecycleService: LifecycleService) {}

  definition() { return tool.definition; }

  run = tool.createRun(async (args, userId, projectId) => {
    const result = await this.lifecycleService.getLifecycle(userId, { project_id: projectId, ...args });
    return result.data;
  });
}
