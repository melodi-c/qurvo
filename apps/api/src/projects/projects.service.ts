import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import * as crypto from 'crypto';
import { projects, projectMembers, plans } from '@qurvo/db';
import { DRIZZLE } from '../providers/drizzle.provider';
import { REDIS } from '../providers/redis.provider';
import type { Database } from '@qurvo/db';
import type Redis from 'ioredis';
import { REDIS_KEY } from '@qurvo/nestjs-infra';
import { ProjectNotFoundException } from './exceptions/project-not-found.exception';
import { InsufficientPermissionsException } from '../exceptions/insufficient-permissions.exception';

const PROJECT_COLUMNS = {
  id: projects.id,
  name: projects.name,
  token: projects.token,
  timezone: projects.timezone,
  plan: plans.slug,
  is_demo: projects.is_demo,
  demo_scenario: projects.demo_scenario,
  created_at: projects.created_at,
  updated_at: projects.updated_at,
  role: projectMembers.role,
};

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

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

    if (!project) {throw new ProjectNotFoundException();}
    return project;
  }

  async create(userId: string, input: { name: string; is_demo?: boolean; demo_scenario?: string }) {
    const freePlan = await this.db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.slug, 'free'))
      .limit(1);
    const planId = freePlan[0]?.id ?? null;

    const project = await this.db.transaction(async (tx) => {
      const token = crypto.randomBytes(24).toString('base64url');

      const [created] = await tx.insert(projects).values({
        name: input.name,
        token,
        plan_id: planId,
        is_demo: input.is_demo ?? false,
        demo_scenario: input.demo_scenario ?? null,
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

  async update(userId: string, projectId: string, input: { name?: string; timezone?: string }) {
    const membership = await this.getMembership(userId, projectId);
    if (membership.role === 'viewer') {throw new InsufficientPermissionsException();}

    const values: Record<string, unknown> = { updated_at: new Date() };
    if (input.name !== undefined) {
      values.name = input.name;
    }
    if (input.timezone !== undefined) {
      values.timezone = input.timezone;
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
    if (membership.role !== 'owner') {throw new InsufficientPermissionsException('Only owner can delete project');}

    await this.db.delete(projects).where(eq(projects.id, projectId));
    this.logger.log({ projectId, userId }, 'Project deleted');
  }

  async rotateToken(userId: string, projectId: string) {
    const membership = await this.getMembership(userId, projectId);
    if (membership.role === 'viewer') {throw new InsufficientPermissionsException();}

    const [current] = await this.db
      .select({ token: projects.token })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!current) {throw new ProjectNotFoundException();}

    const oldToken = current.token;
    const newToken = crypto.randomBytes(24).toString('base64url');

    const [updated] = await this.db
      .update(projects)
      .set({ token: newToken, updated_at: new Date() })
      .where(eq(projects.id, projectId))
      .returning();

    // Invalidate ingest Redis cache for the old token so it can no longer authenticate
    this.redis
      .del(REDIS_KEY.projectToken(oldToken))
      .catch((err: unknown) => this.logger.error({ err }, 'Failed to invalidate old project token cache'));

    this.logger.log({ projectId, userId }, 'Project token rotated');
    return updated;
  }

  async getMembership(userId: string, projectId: string) {
    const result = await this.db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.project_id, projectId), eq(projectMembers.user_id, userId)))
      .limit(1);
    if (result.length === 0) {throw new ProjectNotFoundException();}
    return result[0];
  }
}
