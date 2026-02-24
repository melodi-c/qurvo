import { Injectable, Inject } from '@nestjs/common';
import { z } from 'zod';
import { PATHS_SERVICE } from '../../analytics/analytics.module';
import type { AnalyticsQueryService } from '../../analytics/analytics-query.factory';
import type { PathsQueryParams, PathsQueryResult } from '../../analytics/paths/paths.query';
import { defineTool } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';

const argsSchema = z.object({
  date_from: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
  date_to: z.string().describe('End date in ISO format (YYYY-MM-DD)'),
  step_limit: z.number().int().min(3).max(10).optional().default(5)
    .describe('Maximum number of steps in the path (3-10, default 5)'),
  start_event: z.string().optional()
    .describe('Anchor start point — only show paths starting from this event'),
  end_event: z.string().optional()
    .describe('Anchor end point — only show paths ending at this event'),
  exclusions: z.array(z.string()).optional()
    .describe('Event names to exclude from paths'),
  min_persons: z.number().int().min(1).optional()
    .describe('Minimum person count per transition (default 1)'),
});

const tool = defineTool({
  name: 'query_paths',
  description:
    'Explore user journey paths — discover what sequences of events users actually perform. ' +
    'Returns transitions between events at each step (for Sankey visualization) and top complete paths. ' +
    'Unlike funnels (hypothesis testing), paths are for exploration and discovery. ' +
    'Use start_event to answer "What do users do after X?" or end_event for "What leads users to Y?".',
  schema: argsSchema,
  visualizationType: 'paths_chart',
});

@Injectable()
export class PathsTool implements AiTool {
  readonly name = tool.name;

  constructor(@Inject(PATHS_SERVICE) private readonly pathsService: AnalyticsQueryService<PathsQueryParams, PathsQueryResult>) {}

  definition() { return tool.definition; }

  run = tool.createRun(async (args, userId, projectId) => {
    const result = await this.pathsService.query({ project_id: projectId, ...args });
    return result.data;
  });
}
