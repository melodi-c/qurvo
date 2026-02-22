import { Injectable } from '@nestjs/common';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { UnitEconomicsService } from '../../unit-economics/unit-economics.service';
import type { AiTool, ToolCallResult } from './ai-tool.interface';

@Injectable()
export class UnitEconomicsTool implements AiTool {
  readonly name = 'query_unit_economics';

  constructor(private readonly unitEconomicsService: UnitEconomicsService) {}

  definition(): ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: this.name,
        description:
          'Query unit economics metrics: UA, C1, C2, APC, AVP, ARPPU, ARPU, Churn Rate, LTV, CAC, ROI%, CM. ' +
          'Returns totals and time-series data for the given period.',
        parameters: {
          type: 'object',
          properties: {
            date_from: { type: 'string', description: 'Start date in ISO format (YYYY-MM-DD)' },
            date_to: { type: 'string', description: 'End date in ISO format (YYYY-MM-DD)' },
            granularity: {
              type: 'string',
              enum: ['day', 'week', 'month'],
              description: 'Time bucket granularity',
            },
          },
          required: ['date_from', 'date_to', 'granularity'],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string, projectId: string): Promise<ToolCallResult> {
    const cacheEntry = await this.unitEconomicsService.getMetrics(userId, {
      project_id: projectId,
      date_from: args.date_from as string,
      date_to: args.date_to as string,
      granularity: (args.granularity as 'day' | 'week' | 'month') ?? 'day',
    });
    return { result: cacheEntry.data, visualization_type: 'unit_economics' };
  }
}
