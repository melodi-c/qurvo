import { Injectable } from '@nestjs/common';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { TrendService } from '../trend/trend.service';
import { FunnelService } from '../funnel/funnel.service';
import { RetentionService } from '../retention/retention.service';
import { LifecycleService } from '../lifecycle/lifecycle.service';
import { StickinessService } from '../stickiness/stickiness.service';
import { EventsService } from '../events/events.service';

export interface ToolCallResult {
  result: unknown;
  visualization_type: string | null;
}

@Injectable()
export class AiToolsService {
  constructor(
    private readonly trendService: TrendService,
    private readonly funnelService: FunnelService,
    private readonly retentionService: RetentionService,
    private readonly lifecycleService: LifecycleService,
    private readonly stickinessService: StickinessService,
    private readonly eventsService: EventsService,
  ) {}

  getToolDefinitions(): ChatCompletionTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'query_trend',
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
      },
      {
        type: 'function',
        function: {
          name: 'query_funnel',
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
      },
      {
        type: 'function',
        function: {
          name: 'query_retention',
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
      },
      {
        type: 'function',
        function: {
          name: 'query_lifecycle',
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
      },
      {
        type: 'function',
        function: {
          name: 'query_stickiness',
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
      },
      {
        type: 'function',
        function: {
          name: 'list_event_names',
          description: 'List all tracked event names in the project. Use this to discover available events before querying.',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      },
    ];
  }

  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    userId: string,
    projectId: string,
  ): Promise<ToolCallResult> {
    switch (toolName) {
      case 'query_trend': {
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
      case 'query_funnel': {
        const result = await this.funnelService.getFunnel(userId, {
          project_id: projectId,
          steps: args.steps as { event_name: string; label: string }[],
          conversion_window_days: (args.conversion_window_days as number) ?? 14,
          date_from: args.date_from as string,
          date_to: args.date_to as string,
          breakdown_property: args.breakdown_property as string | undefined,
        } as any);
        return { result: result.data, visualization_type: 'funnel_chart' };
      }
      case 'query_retention': {
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
      case 'query_lifecycle': {
        const result = await this.lifecycleService.getLifecycle(userId, {
          project_id: projectId,
          target_event: args.target_event as string,
          granularity: (args.granularity as string) ?? 'day',
          date_from: args.date_from as string,
          date_to: args.date_to as string,
        } as any);
        return { result: result.data, visualization_type: 'lifecycle_chart' };
      }
      case 'query_stickiness': {
        const result = await this.stickinessService.getStickiness(userId, {
          project_id: projectId,
          target_event: args.target_event as string,
          granularity: (args.granularity as string) ?? 'day',
          date_from: args.date_from as string,
          date_to: args.date_to as string,
        } as any);
        return { result: result.data, visualization_type: 'stickiness_chart' };
      }
      case 'list_event_names': {
        const names = await this.eventsService.getEventNames(userId, projectId);
        return { result: { event_names: names }, visualization_type: null };
      }
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }
}
