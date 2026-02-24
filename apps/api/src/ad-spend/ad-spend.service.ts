import { Injectable, Inject } from '@nestjs/common';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { DRIZZLE } from '../providers/drizzle.provider';
import { adSpend, marketingChannels, type Database } from '@qurvo/db';
import { ProjectsService } from '../projects/projects.service';
import { MarketingChannelsService } from '../marketing-channels/marketing-channels.service';
import { SpendNotFoundException } from './exceptions/spend-not-found.exception';
import { buildConditionalUpdate } from '../utils/build-conditional-update';

@Injectable()
export class AdSpendService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly projectsService: ProjectsService,
    private readonly channelsService: MarketingChannelsService,
  ) {}

  async list(
    userId: string,
    projectId: string,
    filters?: { channel_id?: string; date_from?: string; date_to?: string },
  ) {
    await this.projectsService.getMembership(userId, projectId);

    const conditions = [eq(adSpend.project_id, projectId)];
    if (filters?.channel_id) conditions.push(eq(adSpend.channel_id, filters.channel_id));
    if (filters?.date_from) conditions.push(gte(adSpend.spend_date, filters.date_from));
    if (filters?.date_to) conditions.push(lte(adSpend.spend_date, filters.date_to));

    return this.db
      .select()
      .from(adSpend)
      .where(and(...conditions))
      .orderBy(adSpend.spend_date);
  }

  async create(
    userId: string,
    projectId: string,
    input: {
      channel_id: string;
      spend_date: string;
      amount: string;
      currency?: string;
      note?: string;
    },
  ) {
    await this.projectsService.getMembership(userId, projectId);
    // Validate channel belongs to project
    await this.channelsService.getById(userId, projectId, input.channel_id);

    const rows = await this.db
      .insert(adSpend)
      .values({
        project_id: projectId,
        channel_id: input.channel_id,
        created_by: userId,
        spend_date: input.spend_date,
        amount: input.amount,
        currency: input.currency ?? 'USD',
        note: input.note ?? null,
      })
      .returning();

    return rows[0];
  }

  async bulkCreate(
    userId: string,
    projectId: string,
    items: Array<{
      channel_id: string;
      spend_date: string;
      amount: string;
      currency?: string;
      note?: string;
    }>,
  ) {
    await this.projectsService.getMembership(userId, projectId);

    const values = items.map((item) => ({
      project_id: projectId,
      channel_id: item.channel_id,
      created_by: userId,
      spend_date: item.spend_date,
      amount: item.amount,
      currency: item.currency ?? 'USD',
      note: item.note ?? null,
    }));

    return this.db.insert(adSpend).values(values).returning();
  }

  async update(
    userId: string,
    projectId: string,
    spendId: string,
    input: {
      channel_id?: string;
      spend_date?: string;
      amount?: string;
      currency?: string;
      note?: string;
    },
  ) {
    await this.projectsService.getMembership(userId, projectId);

    if (input.channel_id) {
      await this.channelsService.getById(userId, projectId, input.channel_id);
    }

    const updateData: Record<string, unknown> = { updated_at: new Date(), ...buildConditionalUpdate(input, ['channel_id', 'spend_date', 'amount', 'currency', 'note']) };

    const rows = await this.db
      .update(adSpend)
      .set(updateData)
      .where(and(eq(adSpend.project_id, projectId), eq(adSpend.id, spendId)))
      .returning();

    if (rows.length === 0) throw new SpendNotFoundException();
    return rows[0];
  }

  async remove(userId: string, projectId: string, spendId: string) {
    await this.projectsService.getMembership(userId, projectId);

    const rows = await this.db
      .delete(adSpend)
      .where(and(eq(adSpend.project_id, projectId), eq(adSpend.id, spendId)))
      .returning();

    if (rows.length === 0) throw new SpendNotFoundException();
  }

  async summary(
    userId: string,
    projectId: string,
    filters?: { date_from?: string; date_to?: string },
  ) {
    await this.projectsService.getMembership(userId, projectId);

    const conditions = [eq(adSpend.project_id, projectId)];
    if (filters?.date_from) conditions.push(gte(adSpend.spend_date, filters.date_from));
    if (filters?.date_to) conditions.push(lte(adSpend.spend_date, filters.date_to));

    const rows = await this.db
      .select({
        channel_id: adSpend.channel_id,
        channel_name: marketingChannels.name,
        channel_color: marketingChannels.color,
        total_amount: sql<string>`sum(${adSpend.amount})`,
        record_count: sql<number>`count(*)::int`,
      })
      .from(adSpend)
      .innerJoin(marketingChannels, eq(adSpend.channel_id, marketingChannels.id))
      .where(and(...conditions))
      .groupBy(adSpend.channel_id, marketingChannels.name, marketingChannels.color);

    return rows;
  }

  /** Total spend for a project within a date range (used by UE engine) */
  async getTotalSpend(
    projectId: string,
    dateFrom: string,
    dateTo: string,
    channelId?: string,
  ): Promise<number> {
    const conditions = [
      eq(adSpend.project_id, projectId),
      gte(adSpend.spend_date, dateFrom),
      lte(adSpend.spend_date, dateTo),
    ];
    if (channelId) conditions.push(eq(adSpend.channel_id, channelId));

    const rows = await this.db
      .select({ total: sql<string>`coalesce(sum(${adSpend.amount}), 0)` })
      .from(adSpend)
      .where(and(...conditions));

    return parseFloat(rows[0].total) || 0;
  }
}
