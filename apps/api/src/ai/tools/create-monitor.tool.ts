import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AiMonitorsService } from '../../ai-monitors/ai-monitors.service';
import { defineTool } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';
import {
  channelConfigSchema,
  channelConfigDescription,
} from '../channel-config.schema';

const argsSchema = z.object({
  event_name: z.string().min(1).max(255).describe('Name of the event to monitor (e.g. "purchase", "signup")'),
  metric: z.enum(['count', 'unique_users']).default('count').describe(
    'Metric to track: "count" (total occurrences) or "unique_users" (distinct users). Defaults to "count".',
  ),
  threshold_sigma: z.number().min(1).max(10).default(2.0).describe(
    'Alert threshold in standard deviations (σ). Defaults to 2.0. Higher = less sensitive.',
  ),
  channel_type: z.enum(['email', 'slack', 'telegram']).describe(
    'Notification channel: "email", "slack", or "telegram".',
  ),
  channel_config: channelConfigSchema.describe(channelConfigDescription),
});

const tool = defineTool({
  name: 'create_monitor',
  description:
    'Create an anomaly monitor that tracks an event metric and sends an alert when it deviates ' +
    'significantly from its historical baseline (z-score model). ' +
    'Returns the monitor ID and a link to the monitors page. ' +
    'Use this when the user asks to "set up a monitor", "track an event", "alert me if X drops/spikes", ' +
    'or "notify me when Y changes significantly".',
  schema: argsSchema,
});

@Injectable()
export class CreateMonitorTool implements AiTool {
  readonly name = tool.name;

  constructor(private readonly aiMonitorsService: AiMonitorsService) {}

  definition() { return tool.definition; }

  run = tool.createRun(async (args, _userId, projectId) => {
    const monitor = await this.aiMonitorsService.create(projectId, {
      event_name: args.event_name,
      metric: args.metric,
      threshold_sigma: args.threshold_sigma,
      channel_type: args.channel_type,
      channel_config: args.channel_config as Record<string, unknown>,
    });

    return {
      monitor_id: monitor.id,
      event_name: monitor.event_name,
      metric: monitor.metric,
      threshold_sigma: monitor.threshold_sigma,
      channel_type: monitor.channel_type,
      link: '/ai/monitors',
    };
  });
}
