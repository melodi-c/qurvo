import { Controller, Get, Patch, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsStaffGuard } from '../../admin/guards/is-staff.guard';
import { AdminService } from '../../admin/admin.service';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import {
  PatchUserStaffDto,
  AdminUserDto,
  AdminUserListItemDto,
  AdminUserDetailDto,
} from '../dto/admin.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(IsStaffGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  async listUsers(): Promise<AdminUserListItemDto[]> {
    return this.adminService.listUsers() as any;
  }

  @Get(':id')
  async getUser(@Param('id', ParseUUIDPipe) id: string): Promise<AdminUserDetailDto> {
    return this.adminService.getUser(id) as any;
  }

  @Patch(':id')
  async patchUser(
    @CurrentUser() currentUser: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PatchUserStaffDto,
  ): Promise<AdminUserDto> {
    return this.adminService.patchUser(id, { is_staff: body.is_staff }, currentUser.user_id) as any;
  }
}
