import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DashboardsService } from '../../dashboards/dashboards.service';
import { defineTool } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';

const argsSchema = z.object({
  name: z.string().min(1).max(255).describe('Dashboard name, e.g. "Marketing Q1", "User Acquisition"'),
  description: z.string().max(1000).nullish().describe('Optional description of the dashboard purpose'),
});

const tool = defineTool({
  name: 'create_dashboard',
  description:
    'Create a new empty dashboard in the project. ' +
    'Returns the dashboard ID and a direct link to it. ' +
    'Use this when the user asks to "create a dashboard", "make a new dashboard", or "set up a dashboard for X". ' +
    'After creating, use save_to_dashboard to add insights as widgets.',
  schema: argsSchema,
});

@Injectable()
export class CreateDashboardTool implements AiTool {
  readonly name = tool.name;

  constructor(private readonly dashboardsService: DashboardsService) {}

  definition() { return tool.definition; }

  run = tool.createRun(async (args, userId, projectId) => {
    const dashboard = await this.dashboardsService.create(userId, projectId, {
      name: args.name,
    });

    return {
      dashboard_id: dashboard.id,
      name: dashboard.name,
      link: `/dashboards/${dashboard.id}`,
    };
  });
}
