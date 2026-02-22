import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { UnitEconomicsService } from '../../unit-economics/unit-economics.service';
import { defineTool } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';

const argsSchema = z.object({
  date_from: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
  date_to: z.string().describe('End date in ISO format (YYYY-MM-DD)'),
  granularity: z.enum(['day', 'week', 'month']).describe('Time bucket granularity'),
});

const tool = defineTool({
  name: 'query_unit_economics',
  description:
    'Query unit economics metrics: UA, C1, C2, APC, AVP, ARPPU, ARPU, Churn Rate, LTV, CAC, ROI%, CM. ' +
    'Returns totals and time-series data for the given period.',
  schema: argsSchema,
  visualizationType: 'unit_economics',
});

@Injectable()
export class UnitEconomicsTool implements AiTool {
  readonly name = tool.name;

  constructor(private readonly unitEconomicsService: UnitEconomicsService) {}

  definition() { return tool.definition; }

  run = tool.createRun(async (args, userId, projectId) => {
    const cacheEntry = await this.unitEconomicsService.getMetrics(userId, { project_id: projectId, ...args });
    return cacheEntry.data;
  });
}
