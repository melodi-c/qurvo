import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DashboardsService } from '../../dashboards/dashboards.service';
import { defineTool } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';

const tool = defineTool({
  name: 'list_dashboards',
  description:
    'List all dashboards in the current project. ' +
    'Use this to discover available dashboard IDs before calling save_to_dashboard.',
  schema: z.object({}),
});

@Injectable()
export class ListDashboardsTool implements AiTool {
  readonly name = tool.name;

  constructor(private readonly dashboardsService: DashboardsService) {}

  definition() { return tool.definition; }

  run = tool.createRun(async (_args, _userId, projectId) => {
    const dashboards = await this.dashboardsService.list(projectId);
    return {
      dashboards: dashboards.map((d) => ({
        id: d.id,
        name: d.name,
        link: `/dashboards/${d.id}`,
      })),
      total: dashboards.length,
    };
  });
}
