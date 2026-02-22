import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { UnitEconomicsService } from '../../unit-economics/unit-economics.service';
import { BaseAiTool } from './ai-tool.interface';

const argsSchema = z.object({
  date_from: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
  date_to: z.string().describe('End date in ISO format (YYYY-MM-DD)'),
  granularity: z.enum(['day', 'week', 'month']).describe('Time bucket granularity'),
});

@Injectable()
export class UnitEconomicsTool extends BaseAiTool<typeof argsSchema> {
  readonly name = 'query_unit_economics';
  readonly description =
    'Query unit economics metrics: UA, C1, C2, APC, AVP, ARPPU, ARPU, Churn Rate, LTV, CAC, ROI%, CM. ' +
    'Returns totals and time-series data for the given period.';
  readonly argsSchema = argsSchema;
  readonly visualizationType = 'unit_economics';

  constructor(private readonly unitEconomicsService: UnitEconomicsService) {
    super();
  }

  protected async execute(args: z.infer<typeof argsSchema>, userId: string, projectId: string) {
    const cacheEntry = await this.unitEconomicsService.getMetrics(userId, {
      project_id: projectId,
      ...args,
    });
    return cacheEntry.data;
  }
}
