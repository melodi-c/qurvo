import { Injectable, Inject } from '@nestjs/common';
import { eq, sql, count } from 'drizzle-orm';
import type { Database } from '@qurvo/db';
import { users, projects, plans, projectMembers } from '@qurvo/db';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import type Redis from 'ioredis';
import { DRIZZLE } from '../providers/drizzle.provider';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import { REDIS } from '../providers/redis.provider';
import { AppNotFoundException } from '../exceptions/app-not-found.exception';
import { AppConflictException } from '../exceptions/app-conflict.exception';
import { AppForbiddenException } from '../exceptions/app-forbidden.exception';

export interface AdminStatsResult {
  total_users: number;
  total_projects: number;
  total_events: number;
  redis_stream_depth: number;
}

export interface AdminUserListItemResult {
  id: string;
  email: string;
  display_name: string;
  is_staff: boolean;
  email_verified: boolean;
  created_at: Date;
  project_count: number;
}

export interface AdminUserProjectResult {
  id: string;
  name: string;
  role: 'owner' | 'editor' | 'viewer';
}

export interface AdminUserDetailResult {
  id: string;
  email: string;
  display_name: string;
  is_staff: boolean;
  email_verified: boolean;
  created_at: Date;
  projects: AdminUserProjectResult[];
}

export interface AdminUserResult {
  id: string;
  email: string;
  display_name: string;
  is_staff: boolean;
}

export interface AdminProjectListItemResult {
  id: string;
  name: string;
  plan_id: string | null;
  plan_name: string | null;
  member_count: number;
  created_at: Date;
}

export interface AdminProjectMemberResult {
  id: string;
  email: string;
  display_name: string;
  role: 'owner' | 'editor' | 'viewer';
}

export interface AdminProjectDetailResult {
  id: string;
  name: string;
  token: string;
  plan_id: string | null;
  plan_name: string | null;
  created_at: Date;
  members: AdminProjectMemberResult[];
}

export interface AdminPlanResult {
  id: string;
  slug: string;
  name: string;
  events_limit: number | null;
  data_retention_days: number | null;
  max_projects: number | null;
  ai_messages_per_month: number | null;
  features: unknown;
  is_public: boolean;
  created_at: Date;
}

export interface CreatePlanInput {
  slug: string;
  name: string;
  events_limit?: number | null;
  data_retention_days?: number | null;
  max_projects?: number | null;
  ai_messages_per_month?: number | null;
  features: unknown;
  is_public?: boolean;
}

export interface PatchPlanInput {
  name?: string;
  events_limit?: number | null;
  data_retention_days?: number | null;
  max_projects?: number | null;
  ai_messages_per_month?: number | null;
  features?: unknown;
  is_public?: boolean;
}

export interface PatchUserInput {
  is_staff: boolean;
}

export interface PatchProjectInput {
  plan_id?: string | null;
}

@Injectable()
export class AdminService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async getStats(): Promise<AdminStatsResult> {
    const [usersResult, projectsResult, chResult, streamDepth] = await Promise.all([
      this.db.select({ count: sql<string>`COUNT(*)` }).from(users),
      this.db.select({ count: sql<string>`COUNT(*)` }).from(projects),
      this.ch.query({ query: 'SELECT COUNT(*) AS count FROM events', format: 'JSONEachRow' }),
      this.redis.xlen('events:incoming'),
    ]);

    const chRows = await chResult.json<{ count: string }>();
    const totalEvents = chRows.length > 0 ? parseInt(chRows[0].count, 10) : 0;

    return {
      total_users: parseInt(usersResult[0].count, 10),
      total_projects: parseInt(projectsResult[0].count, 10),
      total_events: totalEvents,
      redis_stream_depth: streamDepth,
    };
  }

  async listUsers(): Promise<AdminUserListItemResult[]> {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        display_name: users.display_name,
        is_staff: users.is_staff,
        email_verified: users.email_verified,
        created_at: users.created_at,
        project_count: sql<number>`COUNT(${projectMembers.id})::int`,
      })
      .from(users)
      .leftJoin(projectMembers, eq(users.id, projectMembers.user_id))
      .groupBy(
        users.id,
        users.email,
        users.display_name,
        users.is_staff,
        users.email_verified,
        users.created_at,
      )
      .orderBy(users.created_at);

    return rows as AdminUserListItemResult[];
  }

  async getUser(id: string): Promise<AdminUserDetailResult> {
    const userRows = await this.db
      .select({
        id: users.id,
        email: users.email,
        display_name: users.display_name,
        is_staff: users.is_staff,
        email_verified: users.email_verified,
        created_at: users.created_at,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (userRows.length === 0) {
      throw new AppNotFoundException('User not found');
    }

    const user = userRows[0];

    const memberRows = await this.db
      .select({
        id: projects.id,
        name: projects.name,
        role: projectMembers.role,
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projectMembers.project_id, projects.id))
      .where(eq(projectMembers.user_id, id));

    return {
      ...user,
      projects: memberRows as AdminUserProjectResult[],
    };
  }

  async patchUser(id: string, input: PatchUserInput, currentUserId: string): Promise<AdminUserResult> {
    if (currentUserId === id && input.is_staff === false) {
      throw new AppForbiddenException('Cannot remove staff status from yourself');
    }

    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (existing.length === 0) {
      throw new AppNotFoundException('User not found');
    }

    const [updated] = await this.db
      .update(users)
      .set({ is_staff: input.is_staff, updated_at: new Date() })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        email: users.email,
        display_name: users.display_name,
        is_staff: users.is_staff,
      });

    return updated;
  }

  async listProjects(): Promise<AdminProjectListItemResult[]> {
    const rows = await this.db
      .select({
        id: projects.id,
        name: projects.name,
        plan_id: projects.plan_id,
        plan_name: plans.name,
        member_count: sql<number>`COUNT(${projectMembers.id})::int`,
        created_at: projects.created_at,
      })
      .from(projects)
      .leftJoin(plans, eq(projects.plan_id, plans.id))
      .leftJoin(projectMembers, eq(projects.id, projectMembers.project_id))
      .groupBy(
        projects.id,
        projects.name,
        projects.plan_id,
        plans.name,
        projects.created_at,
      )
      .orderBy(projects.created_at);

    return rows as AdminProjectListItemResult[];
  }

  async getProject(id: string): Promise<AdminProjectDetailResult> {
    const projectRows = await this.db
      .select({
        id: projects.id,
        name: projects.name,
        token: projects.token,
        plan_id: projects.plan_id,
        plan_name: plans.name,
        created_at: projects.created_at,
      })
      .from(projects)
      .leftJoin(plans, eq(projects.plan_id, plans.id))
      .where(eq(projects.id, id))
      .limit(1);

    if (projectRows.length === 0) {
      throw new AppNotFoundException('Project not found');
    }

    const project = projectRows[0];

    const memberRows = await this.db
      .select({
        id: users.id,
        email: users.email,
        display_name: users.display_name,
        role: projectMembers.role,
      })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.user_id, users.id))
      .where(eq(projectMembers.project_id, id));

    return {
      ...project,
      members: memberRows as AdminProjectMemberResult[],
    };
  }

  async patchProject(id: string, input: PatchProjectInput): Promise<AdminProjectDetailResult> {
    const existing = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (existing.length === 0) {
      throw new AppNotFoundException('Project not found');
    }

    await this.db
      .update(projects)
      .set({ plan_id: input.plan_id ?? null, updated_at: new Date() })
      .where(eq(projects.id, id));

    return this.getProject(id);
  }

  async listPlans(): Promise<AdminPlanResult[]> {
    const rows = await this.db
      .select()
      .from(plans)
      .orderBy(plans.created_at);

    return rows as AdminPlanResult[];
  }

  async createPlan(input: CreatePlanInput): Promise<AdminPlanResult> {
    const [created] = await this.db
      .insert(plans)
      .values({
        slug: input.slug,
        name: input.name,
        events_limit: input.events_limit ?? null,
        data_retention_days: input.data_retention_days ?? null,
        max_projects: input.max_projects ?? null,
        ai_messages_per_month: input.ai_messages_per_month ?? null,
        features: input.features as any,
        is_public: input.is_public ?? true,
      })
      .returning();

    return created as AdminPlanResult;
  }

  async patchPlan(id: string, input: PatchPlanInput): Promise<AdminPlanResult> {
    const existing = await this.db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.id, id))
      .limit(1);

    if (existing.length === 0) {
      throw new AppNotFoundException('Plan not found');
    }

    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.events_limit !== undefined) updateData.events_limit = input.events_limit ?? null;
    if (input.data_retention_days !== undefined) updateData.data_retention_days = input.data_retention_days ?? null;
    if (input.max_projects !== undefined) updateData.max_projects = input.max_projects ?? null;
    if (input.ai_messages_per_month !== undefined) updateData.ai_messages_per_month = input.ai_messages_per_month ?? null;
    if (input.features !== undefined) updateData.features = input.features;
    if (input.is_public !== undefined) updateData.is_public = input.is_public;

    const [updated] = await this.db
      .update(plans)
      .set(updateData)
      .where(eq(plans.id, id))
      .returning();

    return updated as AdminPlanResult;
  }

  async deletePlan(id: string): Promise<void> {
    const existing = await this.db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.id, id))
      .limit(1);

    if (existing.length === 0) {
      throw new AppNotFoundException('Plan not found');
    }

    const [projectCount] = await this.db
      .select({ count: sql<string>`COUNT(*)` })
      .from(projects)
      .where(eq(projects.plan_id, id));

    if (parseInt(projectCount.count, 10) > 0) {
      throw new AppConflictException('Cannot delete plan: projects are assigned to it');
    }

    await this.db.delete(plans).where(eq(plans.id, id));
  }
}
