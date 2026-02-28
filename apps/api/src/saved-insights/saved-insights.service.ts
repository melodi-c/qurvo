import { Injectable, Inject } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE } from '../providers/drizzle.provider';
import { insights, type InsightConfig, type InsightType, type Database } from '@qurvo/db';
import { InsightNotFoundException } from './exceptions/insight-not-found.exception';
import { buildConditionalUpdate } from '../utils/build-conditional-update';

@Injectable()
export class SavedInsightsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async list(projectId: string, type?: InsightType) {
    const conditions = [eq(insights.project_id, projectId)];
    if (type) {conditions.push(eq(insights.type, type));}

    return this.db
      .select()
      .from(insights)
      .where(and(...conditions))
      .orderBy(insights.created_at);
  }

  async getById(projectId: string, insightId: string) {
    const rows = await this.db
      .select()
      .from(insights)
      .where(and(eq(insights.project_id, projectId), eq(insights.id, insightId)));

    if (rows.length === 0) {throw new InsightNotFoundException();}
    return rows[0];
  }

  async create(
    userId: string,
    projectId: string,
    input: { type: InsightType; name: string; description?: string; config: InsightConfig },
  ) {
    const rows = await this.db
      .insert(insights)
      .values({
        project_id: projectId,
        created_by: userId,
        type: input.type,
        name: input.name,
        description: input.description ?? null,
        config: input.config,
      })
      .returning();

    return rows[0];
  }

  async update(
    projectId: string,
    insightId: string,
    input: { name?: string; description?: string; config?: InsightConfig; is_favorite?: boolean },
  ) {
    const updateData: Record<string, unknown> = { updated_at: new Date(), ...buildConditionalUpdate(input, ['name', 'description', 'config', 'is_favorite']) };

    const rows = await this.db
      .update(insights)
      .set(updateData)
      .where(and(eq(insights.project_id, projectId), eq(insights.id, insightId)))
      .returning();

    if (rows.length === 0) {throw new InsightNotFoundException();}
    return rows[0];
  }

  async remove(projectId: string, insightId: string) {
    const rows = await this.db
      .delete(insights)
      .where(and(eq(insights.project_id, projectId), eq(insights.id, insightId)))
      .returning();

    if (rows.length === 0) {throw new InsightNotFoundException();}
  }
}
