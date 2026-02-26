import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PeriodicWorkerMixin } from '@qurvo/worker-core';
import { eq } from 'drizzle-orm';
import { aiScheduledJobs } from '@qurvo/db';
import type { AiScheduledJob, Database } from '@qurvo/db';
import { DRIZZLE } from '@qurvo/nestjs-infra';
import OpenAI from 'openai';
import { NotificationService } from './notification.service';

export function isDue(job: Pick<AiScheduledJob, 'last_run_at' | 'schedule'>, now: Date): boolean {
  if (!job.last_run_at) return true; // Never ran before
  const last = job.last_run_at;
  if (job.schedule === 'daily') {
    return now.getTime() - last.getTime() >= 24 * 60 * 60 * 1000;
  }
  if (job.schedule === 'weekly') {
    return now.getTime() - last.getTime() >= 7 * 24 * 60 * 60 * 1000;
  }
  if (job.schedule === 'monthly') {
    const nextRun = new Date(last);
    nextRun.setMonth(nextRun.getMonth() + 1);
    return now >= nextRun;
  }
  return false;
}

const SCHEDULED_JOBS_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const SCHEDULED_JOBS_INITIAL_DELAY_MS = 60_000; // 60s

@Injectable()
export class ScheduledJobsService extends PeriodicWorkerMixin {
  protected readonly intervalMs = SCHEDULED_JOBS_CHECK_INTERVAL_MS;
  protected readonly initialDelayMs = SCHEDULED_JOBS_INITIAL_DELAY_MS;

  private client: OpenAI | null = null;
  private readonly model: string;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectPinoLogger(ScheduledJobsService.name) protected readonly logger: PinoLogger,
    private readonly notificationService: NotificationService,
  ) {
    super();
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    if (process.env.OPENAI_API_KEY) {
      this.client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL,
      });
    } else {
      // Client will be null; runJob will skip AI call and log a warning
    }
  }

  async runCycle(): Promise<void> {
    const now = new Date();
    const jobs = await this.db
      .select()
      .from(aiScheduledJobs)
      .where(eq(aiScheduledJobs.is_active, true));

    this.logger.debug({ count: jobs.length }, 'Checking scheduled jobs');

    for (const job of jobs) {
      if (this.isDue(job, now)) {
        try {
          await this.runJob(job);
        } catch (err) {
          this.logger.error({ err, jobId: job.id }, 'Scheduled job run failed');
        }
      }
    }
  }

  isDue(job: AiScheduledJob, now: Date): boolean {
    return isDue(job, now);
  }

  private async runJob(job: AiScheduledJob): Promise<void> {
    this.logger.info({ jobId: job.id, jobName: job.name }, 'Running scheduled AI job');

    if (!this.client) {
      this.logger.warn({ jobId: job.id }, 'OPENAI_API_KEY not configured, skipping AI job');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const systemPrompt = `You are an analytics AI assistant for the Qurvo platform. Today's date is ${today}. Answer concisely and clearly.`;

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: job.prompt },
      ],
    });

    const resultText = response.choices[0]?.message?.content ?? '(no response)';

    let channelConfig: Record<string, unknown> = {};
    try {
      channelConfig = JSON.parse(job.channel_config) as Record<string, unknown>;
    } catch {
      this.logger.warn({ jobId: job.id }, 'Failed to parse channel_config JSON');
    }

    await this.notificationService.sendScheduledJobResult(
      job.name,
      job.prompt,
      resultText,
      job.channel_type,
      channelConfig,
    );

    await this.db
      .update(aiScheduledJobs)
      .set({ last_run_at: new Date(), updated_at: new Date() })
      .where(eq(aiScheduledJobs.id, job.id));

    this.logger.info({ jobId: job.id, jobName: job.name }, 'Scheduled AI job completed');
  }
}
