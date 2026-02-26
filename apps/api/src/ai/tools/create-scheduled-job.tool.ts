import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AiScheduledJobsService } from '../../ai-scheduled-jobs/ai-scheduled-jobs.service';
import { defineTool } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';
import {
  channelConfigSchema,
  channelConfigDescription,
} from '../channel-config.schema';

const argsSchema = z.object({
  name: z.string().min(1).max(255).describe('Human-readable name for the scheduled job (e.g. "Weekly conversion report")'),
  prompt: z.string().min(1).describe(
    'The AI prompt to execute on each run. Should describe what to analyse and what insights to include in the report.',
  ),
  schedule: z.enum(['daily', 'weekly', 'monthly']).describe(
    'How often the job runs: "daily" (every day), "weekly" (every Monday), or "monthly" (1st of each month).',
  ),
  channel_type: z.enum(['slack', 'email', 'telegram']).describe(
    'Delivery channel for the report: "slack", "email", or "telegram".',
  ),
  channel_config: channelConfigSchema.describe(channelConfigDescription),
});

const tool = defineTool({
  name: 'create_scheduled_job',
  description:
    'Create an AI-powered scheduled job that runs a prompt on a recurring schedule (daily, weekly, or monthly) ' +
    'and delivers the AI-generated report to Slack, email, or Telegram. ' +
    'Returns the job ID and a link to the scheduled jobs page. ' +
    'Use this when the user asks to "send me a weekly report", "set up a daily digest", ' +
    '"schedule a monthly summary", or "automate AI reports".',
  schema: argsSchema,
});

@Injectable()
export class CreateScheduledJobTool implements AiTool {
  readonly name = tool.name;

  constructor(private readonly aiScheduledJobsService: AiScheduledJobsService) {}

  definition() { return tool.definition; }

  run = tool.createRun(async (args, userId, projectId) => {
    const job = await this.aiScheduledJobsService.create(projectId, userId, {
      name: args.name,
      prompt: args.prompt,
      schedule: args.schedule,
      channel_type: args.channel_type,
      channel_config: args.channel_config as Record<string, unknown>,
    });

    return {
      job_id: job.id,
      name: job.name,
      schedule: job.schedule,
      channel_type: job.channel_type,
      link: '/ai/scheduled-jobs',
    };
  });
}
