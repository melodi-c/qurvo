import { Injectable, Inject } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE } from '../providers/drizzle.provider';
import { insights, type InsightConfig, type InsightType, type Database } from '@qurvo/db';
import { ProjectsService } from '../projects/projects.service';
import { InsightNotFoundException } from './exceptions/insight-not-found.exception';

@Injectable()
export class InsightsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly projectsService: ProjectsService,
  ) {}

  async list(userId: string, projectId: string, type?: InsightType) {
    await this.projectsService.getMembership(userId, projectId);

    const conditions = [eq(insights.project_id, projectId)];
    if (type) conditions.push(eq(insights.type, type));

    return this.db
      .select()
      .from(insights)
      .where(and(...conditions))
      .orderBy(insights.created_at);
  }

  async getById(userId: string, projectId: string, insightId: string) {
    await this.projectsService.getMembership(userId, projectId);

    const rows = await this.db
      .select()
      .from(insights)
      .where(and(eq(insights.project_id, projectId), eq(insights.id, insightId)));

    if (rows.length === 0) throw new InsightNotFoundException();
    return rows[0];
  }

  async create(
    userId: string,
    projectId: string,
    input: { type: InsightType; name: string; description?: string; config: InsightConfig },
  ) {
    await this.projectsService.getMembership(userId, projectId);

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
    userId: string,
    projectId: string,
    insightId: string,
    input: { name?: string; description?: string; config?: InsightConfig },
  ) {
    await this.projectsService.getMembership(userId, projectId);

    const existing = await this.db
      .select()
      .from(insights)
      .where(and(eq(insights.project_id, projectId), eq(insights.id, insightId)));

    if (existing.length === 0) throw new InsightNotFoundException();

    const updateData: Record<string, unknown> = { updated_at: new Date() };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.config !== undefined) updateData.config = input.config;

    const rows = await this.db
      .update(insights)
      .set(updateData)
      .where(eq(insights.id, insightId))
      .returning();

    return rows[0];
  }

  async remove(userId: string, projectId: string, insightId: string) {
    await this.projectsService.getMembership(userId, projectId);

    const existing = await this.db
      .select()
      .from(insights)
      .where(and(eq(insights.project_id, projectId), eq(insights.id, insightId)));

    if (existing.length === 0) throw new InsightNotFoundException();

    await this.db.delete(insights).where(eq(insights.id, insightId));
  }
}
