import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { LifecycleService } from '../../lifecycle/lifecycle.service';
import { AiVisualizationTool } from './ai-tool.interface';

const argsSchema = z.object({
  target_event: z.string().describe('Event to analyze lifecycle for'),
  granularity: z.enum(['day', 'week', 'month']).describe('Period granularity'),
  date_from: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
  date_to: z.string().describe('End date in ISO format (YYYY-MM-DD)'),
});

@Injectable()
export class LifecycleTool extends AiVisualizationTool<typeof argsSchema> {
  readonly name = 'query_lifecycle';
  readonly description =
    'Query user lifecycle stages — categorizes users into new, returning, resurrecting, and dormant over time.';
  readonly argsSchema = argsSchema;
  readonly visualizationType = 'lifecycle_chart';

  constructor(private readonly lifecycleService: LifecycleService) {
    super();
  }

  protected async execute(args: z.infer<typeof argsSchema>, userId: string, projectId: string) {
    const result = await this.lifecycleService.getLifecycle(userId, {
      project_id: projectId,
      ...args,
    } as any);
    return result.data;
  }
}
