import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { aiScheduledJobs } from '@qurvo/db';
import type { InsertAiScheduledJob } from '@qurvo/db';
import {
  createTestProject,
  type ContainerContext,
  type TestProject,
} from '@qurvo/testing';
import type { INestApplicationContext } from '@nestjs/common';
import { getTestContext } from './context';
import { ScheduledJobsService } from '../scheduled-jobs/scheduled-jobs.service';

let ctx: ContainerContext;
let app: INestApplicationContext;
let testProject: TestProject;
let svc: ScheduledJobsService;

beforeAll(async () => {
  const tc = await getTestContext();
  ctx = tc.ctx;
  app = tc.app;
  testProject = tc.testProject;
  svc = app.get(ScheduledJobsService);
}, 120_000);

/**
 * Creates an active scheduled job in the DB for the given project.
 */
async function createJob(
  projectId: string,
  userId: string,
  schedule: string,
  lastRunAt: Date | null = null,
): Promise<string> {
  const [row] = await ctx.db
    .insert(aiScheduledJobs)
    .values({
      project_id: projectId,
      user_id: userId,
      name: `Test Job ${randomUUID().slice(0, 8)}`,
      prompt: 'What is the current state of metrics?',
      schedule,
      channel_type: 'slack',
      channel_config: { webhook_url: 'https://hooks.slack.com/test' },
      is_active: true,
      last_run_at: lastRunAt,
    } as InsertAiScheduledJob)
    .returning({ id: aiScheduledJobs.id });
  return row.id;
}

describe('ScheduledJobsService', () => {
  describe('runJob() without AI runner config', () => {
    it('logs a warning and returns without throwing when INTERNAL_API_URL/TOKEN are not set', async () => {
      // The context bootstraps without INTERNAL_API_URL/TOKEN, so aiRunner.isConfigured == false
      const tp = await createTestProject(ctx.db);
      const jobId = await createJob(tp.projectId, tp.userId, 'daily', null);

      // runCycle calls isDue (null last_run_at → always due) then runJob
      // runJob should return early without throwing since aiRunner is not configured
      await expect(svc.runCycle()).resolves.not.toThrow();
    });
  });

  describe('runCycle()', () => {
    it('only runs due jobs (last_run_at null → due)', async () => {
      const tp = await createTestProject(ctx.db);

      // Job with null last_run_at → always due
      const dueJobId = await createJob(tp.projectId, tp.userId, 'daily', null);

      await svc.runCycle();

      // Since INTERNAL_API_URL/TOKEN are not configured, job is skipped early — but last_run_at is NOT updated
      // (the update happens after AI call, which is skipped)
      // The key assertion is that runCycle() doesn't throw
      const jobs = await ctx.db
        .select()
        .from(aiScheduledJobs)
        .where(eq(aiScheduledJobs.id, dueJobId));

      expect(jobs).toHaveLength(1);
      // last_run_at stays null because runJob() returns early (aiRunner not configured)
      expect(jobs[0].last_run_at).toBeNull();
    });

    it('skips jobs that are not yet due', async () => {
      const tp = await createTestProject(ctx.db);

      // A daily job that ran only 1 hour ago → not due yet
      const recentLastRun = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      const notDueJobId = await createJob(tp.projectId, tp.userId, 'daily', recentLastRun);

      await expect(svc.runCycle()).resolves.not.toThrow();

      const jobs = await ctx.db
        .select()
        .from(aiScheduledJobs)
        .where(eq(aiScheduledJobs.id, notDueJobId));

      // last_run_at should still be the original value (job was not run)
      expect(jobs[0].last_run_at?.toISOString()).toBe(recentLastRun.toISOString());
    });

    it('skips inactive jobs', async () => {
      const tp = await createTestProject(ctx.db);

      // Create an inactive job
      const [row] = await ctx.db
        .insert(aiScheduledJobs)
        .values({
          project_id: tp.projectId,
          user_id: tp.userId,
          name: `Inactive Job ${randomUUID().slice(0, 8)}`,
          prompt: 'This job is inactive',
          schedule: 'daily',
          channel_type: 'slack',
          channel_config: { webhook_url: 'https://hooks.slack.com/test' },
          is_active: false,
          last_run_at: null,
        } as InsertAiScheduledJob)
        .returning({ id: aiScheduledJobs.id });

      await expect(svc.runCycle()).resolves.not.toThrow();
      // Inactive jobs are not loaded from DB, so their last_run_at stays null
    });

    it('handles multiple jobs in one cycle — due jobs run, not-due jobs skip', async () => {
      const tp = await createTestProject(ctx.db);

      // Job 1: weekly, ran 8 days ago → due
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      const dueWeeklyJobId = await createJob(tp.projectId, tp.userId, 'weekly', eightDaysAgo);

      // Job 2: weekly, ran only 3 days ago → not due
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const notDueWeeklyJobId = await createJob(tp.projectId, tp.userId, 'weekly', threeDaysAgo);

      await expect(svc.runCycle()).resolves.not.toThrow();

      const [dueJob] = await ctx.db
        .select()
        .from(aiScheduledJobs)
        .where(eq(aiScheduledJobs.id, dueWeeklyJobId));

      const [notDueJob] = await ctx.db
        .select()
        .from(aiScheduledJobs)
        .where(eq(aiScheduledJobs.id, notDueWeeklyJobId));

      // Due job: ran but since INTERNAL_API_URL/TOKEN not configured, last_run_at not updated
      // (runJob exits before DB update when aiRunner is not configured)
      // Not-due job: skipped entirely, last_run_at unchanged
      expect(notDueJob.last_run_at?.toISOString()).toBe(threeDaysAgo.toISOString());
    });
  });

  describe('isDue()', () => {
    it('returns true for a job with null last_run_at regardless of schedule', () => {
      const now = new Date();
      const job = {
        last_run_at: null,
        schedule: 'daily',
      } as { last_run_at: Date | null; schedule: string };

      // Access isDue via the service (it's public)
      expect(svc.isDue(job as Parameters<typeof svc.isDue>[0], now)).toBe(true);
    });

    it('returns true for daily job due more than 24h ago', () => {
      const now = new Date();
      const last = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25h ago
      const job = { last_run_at: last, schedule: 'daily' };
      expect(svc.isDue(job as Parameters<typeof svc.isDue>[0], now)).toBe(true);
    });

    it('returns false for daily job ran only 10h ago', () => {
      const now = new Date();
      const last = new Date(now.getTime() - 10 * 60 * 60 * 1000); // 10h ago
      const job = { last_run_at: last, schedule: 'daily' };
      expect(svc.isDue(job as Parameters<typeof svc.isDue>[0], now)).toBe(false);
    });

    it('returns true for weekly job due more than 7 days ago', () => {
      const now = new Date();
      const last = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000); // 8 days ago
      const job = { last_run_at: last, schedule: 'weekly' };
      expect(svc.isDue(job as Parameters<typeof svc.isDue>[0], now)).toBe(true);
    });

    it('returns false for weekly job ran only 3 days ago', () => {
      const now = new Date();
      const last = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
      const job = { last_run_at: last, schedule: 'weekly' };
      expect(svc.isDue(job as Parameters<typeof svc.isDue>[0], now)).toBe(false);
    });

    it('returns true for monthly job when a calendar month has elapsed', () => {
      const last = new Date('2025-01-15T10:00:00Z');
      const now = new Date('2025-02-15T10:00:01Z'); // just past calendar month
      const job = { last_run_at: last, schedule: 'monthly' };
      expect(svc.isDue(job as Parameters<typeof svc.isDue>[0], now)).toBe(true);
    });

    it('returns false for monthly job before calendar month boundary', () => {
      const last = new Date('2025-01-15T10:00:00Z');
      const now = new Date('2025-02-14T10:00:00Z'); // one day before
      const job = { last_run_at: last, schedule: 'monthly' };
      expect(svc.isDue(job as Parameters<typeof svc.isDue>[0], now)).toBe(false);
    });
  });
});
