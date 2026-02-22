import { Injectable } from '@nestjs/common';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { LifecycleService } from '../../lifecycle/lifecycle.service';
import type { AiTool, ToolCallResult } from './ai-tool.interface';

@Injectable()
export class LifecycleTool implements AiTool {
  readonly name = 'query_lifecycle';

  constructor(private readonly lifecycleService: LifecycleService) {}

  definition(): ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: this.name,
        description:
          'Query user lifecycle stages — categorizes users into new, returning, resurrecting, and dormant over time.',
        parameters: {
          type: 'object',
          properties: {
            target_event: { type: 'string', description: 'Event to analyze lifecycle for' },
            granularity: {
              type: 'string',
              enum: ['day', 'week', 'month'],
              description: 'Period granularity',
            },
            date_from: { type: 'string', description: 'Start date in ISO format (YYYY-MM-DD)' },
            date_to: { type: 'string', description: 'End date in ISO format (YYYY-MM-DD)' },
          },
          required: ['target_event', 'granularity', 'date_from', 'date_to'],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string, projectId: string): Promise<ToolCallResult> {
    const result = await this.lifecycleService.getLifecycle(userId, {
      project_id: projectId,
      target_event: args.target_event as string,
      granularity: (args.granularity as string) ?? 'day',
      date_from: args.date_from as string,
      date_to: args.date_to as string,
    } as any);
    return { result: result.data, visualization_type: 'lifecycle_chart' };
  }
}
