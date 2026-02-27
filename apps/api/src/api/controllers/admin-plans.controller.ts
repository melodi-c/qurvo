import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, ParseUUIDPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsStaffGuard } from '../../admin/guards/is-staff.guard';
import { AdminService } from '../../admin/admin.service';
import { AdminPlanDto, CreateAdminPlanDto, PatchAdminPlanDto } from '../dto/admin-plans.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(IsStaffGuard)
@Controller('admin/plans')
export class AdminPlansController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  async listPlans(): Promise<AdminPlanDto[]> {
    return this.adminService.listPlans() as any;
  }

  @Post()
  async createPlan(@Body() body: CreateAdminPlanDto): Promise<AdminPlanDto> {
    return this.adminService.createPlan({
      slug: body.slug,
      name: body.name,
      events_limit: body.events_limit,
      data_retention_days: body.data_retention_days,
      max_projects: body.max_projects,
      ai_messages_per_month: body.ai_messages_per_month,
      features: body.features,
      is_public: body.is_public,
    }) as any;
  }

  @Patch(':id')
  async patchPlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PatchAdminPlanDto,
  ): Promise<AdminPlanDto> {
    return this.adminService.patchPlan(id, {
      name: body.name,
      events_limit: body.events_limit,
      data_retention_days: body.data_retention_days,
      max_projects: body.max_projects,
      ai_messages_per_month: body.ai_messages_per_month,
      features: body.features,
      is_public: body.is_public,
    }) as any;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePlan(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.adminService.deletePlan(id);
  }
}
