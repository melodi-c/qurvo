import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PeriodicWorkerMixin } from '@qurvo/worker-core';
import { eq } from 'drizzle-orm';
import { aiScheduledJobs } from '@qurvo/db';
import type { AiScheduledJob, Database } from '@qurvo/db';
import { DRIZZLE } from '@qurvo/nestjs-infra';
import { NotificationService } from './notification.service';
import { AiRunnerService } from './ai-runner.service';

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

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectPinoLogger(ScheduledJobsService.name) protected readonly logger: PinoLogger,
    private readonly notificationService: NotificationService,
    private readonly aiRunner: AiRunnerService,
  ) {
    super();
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

    if (!this.aiRunner.isConfigured) {
      this.logger.warn(
        { jobId: job.id },
        'INTERNAL_API_URL and INTERNAL_API_TOKEN are not configured, skipping AI job',
      );
      return;
    }

    const resultText = await this.aiRunner.runPrompt(job.project_id, job.prompt);

    const channelConfig = (job.channel_config ?? {}) as Record<string, unknown>;

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
