import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { FunnelService } from '../../funnel/funnel.service';
import { BaseAiTool, propertyFilterSchema } from './ai-tool.interface';

const argsSchema = z.object({
  steps: z.array(z.object({
    event_name: z.string().describe('Event name for this funnel step'),
    label: z.string().describe('Display label for this step'),
    filters: z.array(propertyFilterSchema).optional().describe('Optional filters to narrow down events by property values'),
  })).min(2).max(10).describe('Ordered funnel steps'),
  conversion_window_days: z.number().min(1).max(90).optional().describe('Max days allowed for conversion (1-90). Default: 14'),
  date_from: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
  date_to: z.string().describe('End date in ISO format (YYYY-MM-DD)'),
  breakdown_property: z.string().optional().describe('Optional property to break down by'),
});

@Injectable()
export class FunnelTool extends BaseAiTool<typeof argsSchema> {
  readonly name = 'query_funnel';
  readonly description =
    'Query conversion funnel with multiple steps. Returns conversion rates, drop-offs, and average time between steps. Supports per-step filters.';
  readonly argsSchema = argsSchema;
  readonly visualizationType = 'funnel_chart';

  constructor(private readonly funnelService: FunnelService) {
    super();
  }

  protected async execute(args: z.infer<typeof argsSchema>, userId: string, projectId: string) {
    const result = await this.funnelService.getFunnel(userId, {
      project_id: projectId,
      conversion_window_days: args.conversion_window_days ?? 14,
      ...args,
    } as any);
    return result.data;
  }
}
