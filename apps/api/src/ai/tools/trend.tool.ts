import { Injectable } from '@nestjs/common';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { TrendService } from '../../trend/trend.service';
import type { AiTool, ToolCallResult } from './ai-tool.interface';

@Injectable()
export class TrendTool implements AiTool {
  readonly name = 'query_trend';

  constructor(private readonly trendService: TrendService) {}

  definition(): ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: this.name,
        description:
          'Query time-series trend data for events. Returns data points over time with configurable granularity. ' +
          'Supports multiple series, breakdown by property, and period comparison.',
        parameters: {
          type: 'object',
          properties: {
            series: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  event_name: { type: 'string', description: 'Name of the event to track' },
                  label: { type: 'string', description: 'Display label for this series' },
                },
                required: ['event_name', 'label'],
              },
              minItems: 1,
              maxItems: 5,
              description: 'Event series to query',
            },
            metric: {
              type: 'string',
              enum: ['total_events', 'unique_users', 'events_per_user'],
              description: 'Aggregation metric. Default: total_events',
            },
            granularity: {
              type: 'string',
              enum: ['hour', 'day', 'week', 'month'],
              description: 'Time bucket granularity. Use day for <60 days, week for 60-180, month for >180',
            },
            date_from: { type: 'string', description: 'Start date in ISO format (YYYY-MM-DD)' },
            date_to: { type: 'string', description: 'End date in ISO format (YYYY-MM-DD)' },
            breakdown_property: {
              type: 'string',
              description: 'Optional event property to break down by',
            },
            compare: {
              type: 'boolean',
              description: 'Whether to compare with the previous period',
            },
          },
          required: ['series', 'metric', 'granularity', 'date_from', 'date_to'],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string, projectId: string): Promise<ToolCallResult> {
    const result = await this.trendService.getTrend(userId, {
      project_id: projectId,
      series: args.series as { event_name: string; label: string }[],
      metric: (args.metric as string) ?? 'total_events',
      granularity: (args.granularity as string) ?? 'day',
      date_from: args.date_from as string,
      date_to: args.date_to as string,
      breakdown_property: args.breakdown_property as string | undefined,
      compare: args.compare as boolean | undefined,
    } as any);
    return { result: result.data, visualization_type: 'trend_chart' };
  }
}
