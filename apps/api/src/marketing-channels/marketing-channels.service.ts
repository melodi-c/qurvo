import { Injectable, Inject } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE } from '../providers/drizzle.provider';
import { marketingChannels, type Database } from '@qurvo/db';
import { ProjectsService } from '../projects/projects.service';
import { ChannelNotFoundException } from './exceptions/channel-not-found.exception';

@Injectable()
export class MarketingChannelsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly projectsService: ProjectsService,
  ) {}

  async list(userId: string, projectId: string) {
    await this.projectsService.getMembership(userId, projectId);

    return this.db
      .select()
      .from(marketingChannels)
      .where(eq(marketingChannels.project_id, projectId))
      .orderBy(marketingChannels.created_at);
  }

  async getById(userId: string, projectId: string, channelId: string) {
    await this.projectsService.getMembership(userId, projectId);

    const rows = await this.db
      .select()
      .from(marketingChannels)
      .where(and(eq(marketingChannels.project_id, projectId), eq(marketingChannels.id, channelId)));

    if (rows.length === 0) throw new ChannelNotFoundException();
    return rows[0];
  }

  async create(
    userId: string,
    projectId: string,
    input: {
      name: string;
      channel_type?: string;
      filter_conditions?: Array<{property: string; value: string}>;
      color?: string;
      integration_config?: unknown;
    },
  ) {
    await this.projectsService.getMembership(userId, projectId);

    const rows = await this.db
      .insert(marketingChannels)
      .values({
        project_id: projectId,
        created_by: userId,
        name: input.name,
        channel_type: (input.channel_type as any) ?? 'manual',
        filter_conditions: input.filter_conditions ?? [],
        color: input.color ?? null,
        integration_config: input.integration_config ?? null,
      })
      .returning();

    return rows[0];
  }

  async update(
    userId: string,
    projectId: string,
    channelId: string,
    input: {
      name?: string;
      channel_type?: string;
      filter_conditions?: Array<{property: string; value: string}>;
      color?: string;
      integration_config?: unknown;
    },
  ) {
    await this.projectsService.getMembership(userId, projectId);

    const existing = await this.db
      .select()
      .from(marketingChannels)
      .where(and(eq(marketingChannels.project_id, projectId), eq(marketingChannels.id, channelId)));

    if (existing.length === 0) throw new ChannelNotFoundException();

    const updateData: Record<string, unknown> = { updated_at: new Date() };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.channel_type !== undefined) updateData.channel_type = input.channel_type;
    if (input.filter_conditions !== undefined) updateData.filter_conditions = input.filter_conditions;
    if (input.color !== undefined) updateData.color = input.color;
    if (input.integration_config !== undefined) updateData.integration_config = input.integration_config;

    const rows = await this.db
      .update(marketingChannels)
      .set(updateData)
      .where(eq(marketingChannels.id, channelId))
      .returning();

    return rows[0];
  }

  async remove(userId: string, projectId: string, channelId: string) {
    await this.projectsService.getMembership(userId, projectId);

    const existing = await this.db
      .select()
      .from(marketingChannels)
      .where(and(eq(marketingChannels.project_id, projectId), eq(marketingChannels.id, channelId)));

    if (existing.length === 0) throw new ChannelNotFoundException();

    await this.db.delete(marketingChannels).where(eq(marketingChannels.id, channelId));
  }
}
