import { Injectable } from '@nestjs/common';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { RetentionService } from '../../retention/retention.service';
import type { AiTool, ToolCallResult } from './ai-tool.interface';

@Injectable()
export class RetentionTool implements AiTool {
  readonly name = 'query_retention';

  constructor(private readonly retentionService: RetentionService) {}

  definition(): ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: this.name,
        description:
          'Query user retention — how many users return to perform an event over time periods after their first occurrence.',
        parameters: {
          type: 'object',
          properties: {
            target_event: { type: 'string', description: 'Event to track retention for' },
            retention_type: {
              type: 'string',
              enum: ['first_time', 'recurring'],
              description: 'first_time = cohort by first event; recurring = any repeat. Default: first_time',
            },
            granularity: {
              type: 'string',
              enum: ['day', 'week', 'month'],
              description: 'Period granularity',
            },
            periods: {
              type: 'number',
              description: 'Number of periods to show (1-30). Default: 11',
            },
            date_from: { type: 'string', description: 'Start date in ISO format (YYYY-MM-DD)' },
            date_to: { type: 'string', description: 'End date in ISO format (YYYY-MM-DD)' },
          },
          required: ['target_event', 'retention_type', 'granularity', 'date_from', 'date_to'],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string, projectId: string): Promise<ToolCallResult> {
    const result = await this.retentionService.getRetention(userId, {
      project_id: projectId,
      target_event: args.target_event as string,
      retention_type: (args.retention_type as string) ?? 'first_time',
      granularity: (args.granularity as string) ?? 'week',
      periods: (args.periods as number) ?? 11,
      date_from: args.date_from as string,
      date_to: args.date_to as string,
    } as any);
    return { result: result.data, visualization_type: 'retention_chart' };
  }
}
