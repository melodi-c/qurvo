import { Injectable, Inject } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE } from '../providers/drizzle.provider';
import { aiMonitors } from '@qurvo/db';
import type { Database } from '@qurvo/db';
import { MonitorNotFoundException } from './exceptions/monitor-not-found.exception';

export interface CreateMonitorInput {
  event_name: string;
  metric: string;
  threshold_sigma: number;
  channel_type: string;
  channel_config: Record<string, unknown>;
}

export interface UpdateMonitorInput {
  event_name?: string;
  metric?: string;
  threshold_sigma?: number;
  channel_type?: string;
  channel_config?: Record<string, unknown>;
  is_active?: boolean;
}

@Injectable()
export class AiMonitorsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async list(projectId: string) {
    return this.db
      .select()
      .from(aiMonitors)
      .where(eq(aiMonitors.project_id, projectId))
      .orderBy(aiMonitors.created_at);
  }

  async create(projectId: string, input: CreateMonitorInput) {
    const rows = await this.db
      .insert(aiMonitors)
      .values({
        project_id: projectId,
        event_name: input.event_name,
        metric: input.metric,
        threshold_sigma: input.threshold_sigma,
        channel_type: input.channel_type,
        channel_config: input.channel_config,
      })
      .returning();
    return rows[0];
  }

  async update(projectId: string, monitorId: string, input: UpdateMonitorInput) {
    const updateData: Record<string, unknown> = { updated_at: new Date() };
    if (input.event_name !== undefined) updateData['event_name'] = input.event_name;
    if (input.metric !== undefined) updateData['metric'] = input.metric;
    if (input.threshold_sigma !== undefined) updateData['threshold_sigma'] = input.threshold_sigma;
    if (input.channel_type !== undefined) updateData['channel_type'] = input.channel_type;
    if (input.channel_config !== undefined) updateData['channel_config'] = input.channel_config;
    if (input.is_active !== undefined) updateData['is_active'] = input.is_active;

    const rows = await this.db
      .update(aiMonitors)
      .set(updateData)
      .where(and(eq(aiMonitors.project_id, projectId), eq(aiMonitors.id, monitorId)))
      .returning();

    if (rows.length === 0) throw new MonitorNotFoundException();
    return rows[0];
  }

  async remove(projectId: string, monitorId: string) {
    const rows = await this.db
      .delete(aiMonitors)
      .where(and(eq(aiMonitors.project_id, projectId), eq(aiMonitors.id, monitorId)))
      .returning();

    if (rows.length === 0) throw new MonitorNotFoundException();
  }
}
