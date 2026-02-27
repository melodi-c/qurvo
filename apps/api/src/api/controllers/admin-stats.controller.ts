import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsStaffGuard } from '../../admin/guards/is-staff.guard';
import { AdminService } from '../../admin/admin.service';
import { AdminStatsDto } from '../dto/admin.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(IsStaffGuard)
@Controller('admin')
export class AdminStatsController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  async getStats(): Promise<AdminStatsDto> {
    return this.adminService.getStats() as any;
  }
}
