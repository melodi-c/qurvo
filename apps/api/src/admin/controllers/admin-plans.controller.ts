import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, ParseUUIDPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { eq, sql } from 'drizzle-orm';
import type { Database } from '@qurvo/db';
import { plans, projects } from '@qurvo/db';
import { Inject } from '@nestjs/common';
import { DRIZZLE } from '../../providers/drizzle.provider';
import { IsStaffGuard } from '../guards/is-staff.guard';
import { AdminPlanDto, CreateAdminPlanDto, PatchAdminPlanDto } from '../dto/admin-plans.dto';
import { AppNotFoundException } from '../../exceptions/app-not-found.exception';
import { AppConflictException } from '../../exceptions/app-conflict.exception';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(IsStaffGuard)
@Controller('admin/plans')
export class AdminPlansController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get()
  async listPlans(): Promise<AdminPlanDto[]> {
    const rows = await this.db
      .select()
      .from(plans)
      .orderBy(plans.created_at);

    return rows as any;
  }

  @Post()
  async createPlan(@Body() body: CreateAdminPlanDto): Promise<AdminPlanDto> {
    const [created] = await this.db
      .insert(plans)
      .values({
        slug: body.slug,
        name: body.name,
        events_limit: body.events_limit ?? null,
        data_retention_days: body.data_retention_days ?? null,
        max_projects: body.max_projects ?? null,
        ai_messages_per_month: body.ai_messages_per_month ?? null,
        features: body.features,
        is_public: body.is_public ?? true,
      })
      .returning();

    return created as any;
  }

  @Patch(':id')
  async patchPlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PatchAdminPlanDto,
  ): Promise<AdminPlanDto> {
    const existing = await this.db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.id, id))
      .limit(1);

    if (existing.length === 0) {
      throw new AppNotFoundException('Plan not found');
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.events_limit !== undefined) updateData.events_limit = body.events_limit ?? null;
    if (body.data_retention_days !== undefined) updateData.data_retention_days = body.data_retention_days ?? null;
    if (body.max_projects !== undefined) updateData.max_projects = body.max_projects ?? null;
    if (body.ai_messages_per_month !== undefined) updateData.ai_messages_per_month = body.ai_messages_per_month ?? null;
    if (body.features !== undefined) updateData.features = body.features;
    if (body.is_public !== undefined) updateData.is_public = body.is_public;

    const [updated] = await this.db
      .update(plans)
      .set(updateData)
      .where(eq(plans.id, id))
      .returning();

    return updated as any;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePlan(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
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
