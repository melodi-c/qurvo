import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { SavedInsightsService } from '../../saved-insights/saved-insights.service';
import { defineTool } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';
import type { InsightConfig, InsightType } from '@qurvo/db';

const argsSchema = z.object({
  name: z.string().min(1).max(200).describe('Insight title'),
  description: z.string().max(1000).optional().describe('Optional description of what this insight shows'),
  query_type: z.enum(['trend', 'funnel', 'retention', 'lifecycle', 'stickiness', 'paths'])
    .describe('Type of insight to create'),
  query_params: z.record(z.unknown())
    .describe('The full query parameters used to produce the result — same object passed to the corresponding query tool'),
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
    // query_params is Record<string, unknown> from Zod; the AI is expected to pass a
    // structurally valid config object matching the query type, so a single cast is used.
    const config = { type: args.query_type as InsightType, ...args.query_params } as InsightConfig;

    const insight = await this.savedInsightsService.create(userId, projectId, {
      type: args.query_type as InsightType,
      name: args.name,
      description: args.description,
      config,
    });

    const TYPE_SLUGS: Record<InsightType, string> = {
      trend: 'trends',
      funnel: 'funnels',
      retention: 'retentions',
      lifecycle: 'lifecycles',
      stickiness: 'stickiness',
      paths: 'paths',
    };

    return {
      insight_id: insight.id,
      name: insight.name,
      type: insight.type,
      link: `/insights/${TYPE_SLUGS[insight.type]}/${insight.id}`,
    };
  });
}
