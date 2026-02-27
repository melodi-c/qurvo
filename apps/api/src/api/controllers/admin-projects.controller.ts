import { Controller, Get, Patch, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsStaffGuard } from '../../admin/guards/is-staff.guard';
import { AdminService } from '../../admin/admin.service';
import {
  PatchAdminProjectDto,
  AdminProjectListItemDto,
  AdminProjectDetailDto,
} from '../dto/admin.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(IsStaffGuard)
@Controller('admin/projects')
export class AdminProjectsController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  async listProjects(): Promise<AdminProjectListItemDto[]> {
    return this.adminService.listProjects() as any;
  }

  @Get(':id')
  async getProject(@Param('id', ParseUUIDPipe) id: string): Promise<AdminProjectDetailDto> {
    return this.adminService.getProject(id) as any;
  }

  @Patch(':id')
  async patchProject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PatchAdminProjectDto,
  ): Promise<AdminProjectDetailDto> {
    return this.adminService.patchProject(id, { plan_id: body.plan_id }) as any;
  }
}
