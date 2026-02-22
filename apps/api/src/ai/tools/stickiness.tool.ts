import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { StickinessService } from '../../stickiness/stickiness.service';
import { AiVisualizationTool } from './ai-tool.interface';

const argsSchema = z.object({
  target_event: z.string().describe('Event to analyze stickiness for'),
  granularity: z.enum(['day', 'week', 'month']).describe('Period granularity'),
  date_from: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
  date_to: z.string().describe('End date in ISO format (YYYY-MM-DD)'),
});

@Injectable()
export class StickinessTool extends AiVisualizationTool<typeof argsSchema> {
  readonly name = 'query_stickiness';
  readonly description =
    'Query stickiness — how many users perform an event X number of times within each period.';
  readonly argsSchema = argsSchema;
  readonly visualizationType = 'stickiness_chart';

  constructor(private readonly stickinessService: StickinessService) {
    super();
  }

  protected async execute(args: z.infer<typeof argsSchema>, userId: string, projectId: string) {
    const result = await this.stickinessService.getStickiness(userId, {
      project_id: projectId,
      ...args,
    } as any);
    return result.data;
  }
}
