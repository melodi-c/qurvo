import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { RetentionService } from '../../retention/retention.service';
import { AiVisualizationTool } from './ai-tool.interface';

const argsSchema = z.object({
  target_event: z.string().describe('Event to track retention for'),
  retention_type: z.enum(['first_time', 'recurring']).describe('first_time = cohort by first event; recurring = any repeat'),
  granularity: z.enum(['day', 'week', 'month']).describe('Period granularity'),
  periods: z.number().min(1).max(30).optional().describe('Number of periods to show (1-30). Default: 11'),
  date_from: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
  date_to: z.string().describe('End date in ISO format (YYYY-MM-DD)'),
});

@Injectable()
export class RetentionTool extends AiVisualizationTool<typeof argsSchema> {
  readonly name = 'query_retention';
  readonly description =
    'Query user retention — how many users return to perform an event over time periods after their first occurrence.';
  readonly argsSchema = argsSchema;
  readonly visualizationType = 'retention_chart';

  constructor(private readonly retentionService: RetentionService) {
    super();
  }

  protected async execute(args: z.infer<typeof argsSchema>, userId: string, projectId: string) {
    const result = await this.retentionService.getRetention(userId, {
      project_id: projectId,
      periods: args.periods ?? 11,
      ...args,
    } as any);
    return result.data;
  }
}
