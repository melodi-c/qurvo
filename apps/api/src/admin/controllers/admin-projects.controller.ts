import { Controller, Get, Patch, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { eq, sql } from 'drizzle-orm';
import type { Database } from '@qurvo/db';
import { projects, plans, projectMembers, users } from '@qurvo/db';
import { Inject } from '@nestjs/common';
import { DRIZZLE } from '../../providers/drizzle.provider';
import { IsStaffGuard } from '../guards/is-staff.guard';
import {
  PatchAdminProjectDto,
  AdminProjectListItemDto,
  AdminProjectDetailDto,
} from '../dto/admin.dto';
import { AppNotFoundException } from '../../exceptions/app-not-found.exception';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(IsStaffGuard)
@Controller('admin/projects')
export class AdminProjectsController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get()
  async listProjects(): Promise<AdminProjectListItemDto[]> {
    const rows = await this.db
      .select({
        id: projects.id,
        name: projects.name,
        slug: projects.slug,
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
        projects.slug,
        projects.plan_id,
        plans.name,
        projects.created_at,
      )
      .orderBy(projects.created_at);

    return rows as any;
  }

  @Get(':id')
  async getProject(@Param('id', ParseUUIDPipe) id: string): Promise<AdminProjectDetailDto> {
    const projectRows = await this.db
      .select({
        id: projects.id,
        name: projects.name,
        slug: projects.slug,
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
      members: memberRows,
    } as any;
  }

  @Patch(':id')
  async patchProject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PatchAdminProjectDto,
  ): Promise<AdminProjectDetailDto> {
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
      .set({ plan_id: body.plan_id ?? null, updated_at: new Date() })
      .where(eq(projects.id, id));

    return this.getProject(id);
  }
}
