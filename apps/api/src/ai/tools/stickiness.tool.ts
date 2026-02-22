import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { StickinessService } from '../../stickiness/stickiness.service';
import { defineTool } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';

const argsSchema = z.object({
  target_event: z.string().describe('Event to analyze stickiness for'),
  granularity: z.enum(['day', 'week', 'month']).describe('Period granularity'),
  date_from: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
  date_to: z.string().describe('End date in ISO format (YYYY-MM-DD)'),
});

const tool = defineTool({
  name: 'query_stickiness',
  description:
    'Query stickiness — how many users perform an event X number of times within each period.',
  schema: argsSchema,
  visualizationType: 'stickiness_chart',
});

@Injectable()
export class StickinessTool implements AiTool {
  readonly name = tool.name;

  constructor(private readonly stickinessService: StickinessService) {}

  definition() { return tool.definition; }

  run = tool.createRun(async (args, userId, projectId) => {
    const result = await this.stickinessService.getStickiness(userId, { project_id: projectId, ...args });
    return result.data;
  });
}
