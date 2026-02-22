import { Injectable } from '@nestjs/common';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { StickinessService } from '../../stickiness/stickiness.service';
import type { AiTool, ToolCallResult } from './ai-tool.interface';

@Injectable()
export class StickinessTool implements AiTool {
  readonly name = 'query_stickiness';

  constructor(private readonly stickinessService: StickinessService) {}

  definition(): ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: this.name,
        description:
          'Query stickiness — how many users perform an event X number of times within each period.',
        parameters: {
          type: 'object',
          properties: {
            target_event: { type: 'string', description: 'Event to analyze stickiness for' },
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
    const result = await this.stickinessService.getStickiness(userId, {
      project_id: projectId,
      target_event: args.target_event as string,
      granularity: (args.granularity as string) ?? 'day',
      date_from: args.date_from as string,
      date_to: args.date_to as string,
    } as any);
    return { result: result.data, visualization_type: 'stickiness_chart' };
  }
}
