import { Injectable, Inject } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE } from '../providers/drizzle.provider';
import { insights, type InsightConfig, type InsightType, type Database } from '@qurvo/db';
import { ProjectsService } from '../projects/projects.service';
import { InsightNotFoundException } from './exceptions/insight-not-found.exception';
import { buildConditionalUpdate } from '../utils/build-conditional-update';

@Injectable()
export class SavedInsightsService {
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
    input: { name?: string; description?: string; config?: InsightConfig; is_favorite?: boolean },
  ) {
    await this.projectsService.getMembership(userId, projectId);

    const updateData: Record<string, unknown> = { updated_at: new Date(), ...buildConditionalUpdate(input, ['name', 'description', 'config', 'is_favorite']) };

    const rows = await this.db
      .update(insights)
      .set(updateData)
      .where(and(eq(insights.project_id, projectId), eq(insights.id, insightId)))
      .returning();

    if (rows.length === 0) throw new InsightNotFoundException();
    return rows[0];
  }

  async remove(userId: string, projectId: string, insightId: string) {
    await this.projectsService.getMembership(userId, projectId);

    const rows = await this.db
      .delete(insights)
      .where(and(eq(insights.project_id, projectId), eq(insights.id, insightId)))
      .returning();

    if (rows.length === 0) throw new InsightNotFoundException();
  }
}
