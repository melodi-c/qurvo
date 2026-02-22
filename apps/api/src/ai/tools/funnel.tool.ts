import { Injectable } from '@nestjs/common';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { FunnelService } from '../../funnel/funnel.service';
import type { AiTool, ToolCallResult } from './ai-tool.interface';

@Injectable()
export class FunnelTool implements AiTool {
  readonly name = 'query_funnel';

  constructor(private readonly funnelService: FunnelService) {}

  definition(): ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: this.name,
        description:
          'Query conversion funnel with multiple steps. Returns conversion rates, drop-offs, and average time between steps.',
        parameters: {
          type: 'object',
          properties: {
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  event_name: { type: 'string', description: 'Event name for this funnel step' },
                  label: { type: 'string', description: 'Display label for this step' },
                  filters: {
                    type: 'array',
                    description: 'Optional filters to narrow down events by property values',
                    items: {
                      type: 'object',
                      properties: {
                        property: {
                          type: 'string',
                          description:
                            'Property to filter on. Use "properties.<key>" for event properties (e.g. "properties.promocode"), ' +
                            'or direct columns: url, referrer, page_title, page_path, device_type, browser, os, country, region, city',
                        },
                        operator: {
                          type: 'string',
                          enum: ['eq', 'neq', 'contains', 'not_contains', 'is_set', 'is_not_set'],
                          description: 'Filter operator',
                        },
                        value: {
                          type: 'string',
                          description: 'Value to compare against (not needed for is_set/is_not_set)',
                        },
                      },
                      required: ['property', 'operator'],
                    },
                  },
                },
                required: ['event_name', 'label'],
              },
              minItems: 2,
              maxItems: 10,
              description: 'Ordered funnel steps',
            },
            conversion_window_days: {
              type: 'number',
              description: 'Max days allowed for conversion (1-90). Default: 14',
            },
            date_from: { type: 'string', description: 'Start date in ISO format (YYYY-MM-DD)' },
            date_to: { type: 'string', description: 'End date in ISO format (YYYY-MM-DD)' },
            breakdown_property: {
              type: 'string',
              description: 'Optional property to break down by',
            },
          },
          required: ['steps', 'date_from', 'date_to'],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string, projectId: string): Promise<ToolCallResult> {
    const result = await this.funnelService.getFunnel(userId, {
      project_id: projectId,
      steps: args.steps as { event_name: string; label: string; filters?: { property: string; operator: string; value?: string }[] }[],
      conversion_window_days: (args.conversion_window_days as number) ?? 14,
      date_from: args.date_from as string,
      date_to: args.date_to as string,
      breakdown_property: args.breakdown_property as string | undefined,
    } as any);
    return { result: result.data, visualization_type: 'funnel_chart' };
  }
}
