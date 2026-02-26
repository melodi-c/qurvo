import { Injectable, Inject } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE } from '../providers/drizzle.provider';
import { aiScheduledJobs } from '@qurvo/db';
import type { Database } from '@qurvo/db';
import { ScheduledJobNotFoundException } from './exceptions/scheduled-job-not-found.exception';

export interface CreateScheduledJobInput {
  name: string;
  prompt: string;
  schedule: string;
  channel_type: string;
  channel_config: Record<string, unknown>;
}

export interface UpdateScheduledJobInput {
  name?: string;
  prompt?: string;
  schedule?: string;
  channel_type?: string;
  channel_config?: Record<string, unknown>;
  is_active?: boolean;
}

@Injectable()
export class AiScheduledJobsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async list(projectId: string) {
    return this.db
      .select()
      .from(aiScheduledJobs)
      .where(eq(aiScheduledJobs.project_id, projectId))
      .orderBy(aiScheduledJobs.created_at);
  }

  async create(projectId: string, userId: string, input: CreateScheduledJobInput) {
    const rows = await this.db
      .insert(aiScheduledJobs)
      .values({
        project_id: projectId,
        user_id: userId,
        name: input.name,
        prompt: input.prompt,
        schedule: input.schedule,
        channel_type: input.channel_type,
        channel_config: input.channel_config,
      })
      .returning();
    return rows[0];
  }

  async update(projectId: string, jobId: string, input: UpdateScheduledJobInput) {
    const updateData: Record<string, unknown> = { updated_at: new Date() };
    if (input.name !== undefined) updateData['name'] = input.name;
    if (input.prompt !== undefined) updateData['prompt'] = input.prompt;
    if (input.schedule !== undefined) updateData['schedule'] = input.schedule;
    if (input.channel_type !== undefined) updateData['channel_type'] = input.channel_type;
    if (input.channel_config !== undefined) updateData['channel_config'] = input.channel_config;
    if (input.is_active !== undefined) updateData['is_active'] = input.is_active;

    const rows = await this.db
      .update(aiScheduledJobs)
      .set(updateData)
      .where(and(eq(aiScheduledJobs.project_id, projectId), eq(aiScheduledJobs.id, jobId)))
      .returning();

    if (rows.length === 0) throw new ScheduledJobNotFoundException();
    return rows[0];
  }

  async remove(projectId: string, jobId: string) {
    const rows = await this.db
      .delete(aiScheduledJobs)
      .where(and(eq(aiScheduledJobs.project_id, projectId), eq(aiScheduledJobs.id, jobId)))
      .returning();

    if (rows.length === 0) throw new ScheduledJobNotFoundException();
  }
}
