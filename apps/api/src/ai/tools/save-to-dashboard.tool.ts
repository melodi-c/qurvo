import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DashboardsService } from '../../dashboards/dashboards.service';
import { defineTool } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';

const argsSchema = z.object({
  dashboard_id: z.string().uuid().describe('Target dashboard UUID'),
  insight_id: z.string().uuid().describe('Insight to add — use the ID returned by create_insight'),
  position: z.object({
    x: z.number().int().min(0).describe('Column position (0-based)'),
    y: z.number().int().min(0).describe('Row position (0-based)'),
    w: z.number().int().min(1).describe('Width in grid columns'),
    h: z.number().int().min(1).describe('Height in grid rows'),
  }).optional().describe('Optional grid position and size. Defaults to x:0, y:0, w:6, h:4'),
});

const tool = defineTool({
  name: 'save_to_dashboard',
  description:
    'Add a saved insight as a widget on a specific dashboard. ' +
    'Use list_dashboards first to find available dashboard IDs. ' +
    'Use create_insight first to get an insight_id if needed. ' +
    'Returns the widget ID and a link to the dashboard.',
  schema: argsSchema,
});

@Injectable()
export class SaveToDashboardTool implements AiTool {
  readonly name = tool.name;

  constructor(private readonly dashboardsService: DashboardsService) {}

  definition() { return tool.definition; }

  run = tool.createRun(async (args, _userId, projectId) => {
    const layout = {
      x: args.position?.x ?? 0,
      y: args.position?.y ?? 0,
      w: args.position?.w ?? 6,
      h: args.position?.h ?? 4,
    };

    const widget = await this.dashboardsService.addWidget(projectId, args.dashboard_id, {
      insight_id: args.insight_id,
      layout,
    });

    return {
      widget_id: widget.id,
      dashboard_id: args.dashboard_id,
      insight_id: args.insight_id,
      link: `/dashboards/${args.dashboard_id}`,
    };
  });
}
