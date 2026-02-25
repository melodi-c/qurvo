import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and, ne } from 'drizzle-orm';
import { projects, projectMembers, plans } from '@qurvo/db';
import { DRIZZLE } from '../providers/drizzle.provider';
import type { Database } from '@qurvo/db';
import { ProjectNotFoundException } from './exceptions/project-not-found.exception';
import { InsufficientPermissionsException } from '../exceptions/insufficient-permissions.exception';
import { ProjectNameConflictException } from './exceptions/project-name-conflict.exception';

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const PROJECT_COLUMNS = {
  id: projects.id,
  name: projects.name,
  slug: projects.slug,
  plan: plans.slug,
  created_at: projects.created_at,
  updated_at: projects.updated_at,
  role: projectMembers.role,
};

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(userId: string) {
    return this.db
      .select(PROJECT_COLUMNS)
      .from(projectMembers)
      .innerJoin(projects, eq(projectMembers.project_id, projects.id))
      .leftJoin(plans, eq(projects.plan_id, plans.id))
      .where(eq(projectMembers.user_id, userId));
  }

  async getById(userId: string, projectId: string) {
    const [project] = await this.db
      .select(PROJECT_COLUMNS)
      .from(projectMembers)
      .innerJoin(projects, eq(projectMembers.project_id, projects.id))
      .leftJoin(plans, eq(projects.plan_id, plans.id))
      .where(and(eq(projectMembers.project_id, projectId), eq(projectMembers.user_id, userId)))
      .limit(1);

    if (!project) throw new ProjectNotFoundException();
    return project;
  }

  async create(userId: string, input: { name: string }) {
    const slug = slugify(input.name);
    const project = await this.db.transaction(async (tx) => {
      const freePlan = await tx
        .select({ id: plans.id })
        .from(plans)
        .where(eq(plans.slug, 'free'))
        .limit(1);

      const [created] = await tx.insert(projects).values({
        name: input.name,
        slug,
        plan_id: freePlan[0]?.id ?? null,
      }).returning();

      await tx.insert(projectMembers).values({
        project_id: created.id,
        user_id: userId,
        role: 'owner',
      });

      return created;
    });
    this.logger.log({ projectId: project.id, userId }, 'Project created');
    return this.getById(userId, project.id);
  }

  async update(userId: string, projectId: string, input: { name?: string }) {
    const membership = await this.getMembership(userId, projectId);
    if (membership.role === 'viewer') throw new InsufficientPermissionsException();

    const values: Record<string, unknown> = { updated_at: new Date() };
    if (input.name !== undefined) {
      const newSlug = slugify(input.name);
      const existing = await this.db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.slug, newSlug), ne(projects.id, projectId)))
        .limit(1);
      if (existing.length > 0) throw new ProjectNameConflictException();
      values.name = input.name;
      values.slug = newSlug;
    }
    const [updated] = await this.db
      .update(projects)
      .set(values)
      .where(eq(projects.id, projectId))
      .returning();
    this.logger.log({ projectId, userId }, 'Project updated');
    return updated;
  }

  async remove(userId: string, projectId: string) {
    const membership = await this.getMembership(userId, projectId);
    if (membership.role !== 'owner') throw new InsufficientPermissionsException('Only owner can delete project');

    await this.db.delete(projects).where(eq(projects.id, projectId));
    this.logger.log({ projectId, userId }, 'Project deleted');
  }

  async getMembership(userId: string, projectId: string) {
    const result = await this.db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.project_id, projectId), eq(projectMembers.user_id, userId)))
      .limit(1);
    if (result.length === 0) throw new ProjectNotFoundException();
    return result[0];
  }
}
