import { Controller, Patch, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { eq } from 'drizzle-orm';
import type { Database } from '@qurvo/db';
import { users } from '@qurvo/db';
import { Inject } from '@nestjs/common';
import { DRIZZLE } from '../../providers/drizzle.provider';
import { IsStaffGuard } from '../guards/is-staff.guard';
import { CurrentUser, RequestUser } from '../../api/decorators/current-user.decorator';
import { PatchUserStaffDto, AdminUserDto } from '../dto/admin.dto';
import { AppForbiddenException } from '../../exceptions/app-forbidden.exception';
import { AppNotFoundException } from '../../exceptions/app-not-found.exception';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(IsStaffGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Patch(':id')
  async patchUser(
    @CurrentUser() currentUser: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PatchUserStaffDto,
  ): Promise<AdminUserDto> {
    if (currentUser.user_id === id && body.is_staff === false) {
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
      .set({ is_staff: body.is_staff, updated_at: new Date() })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        email: users.email,
        display_name: users.display_name,
        is_staff: users.is_staff,
      });

    return updated as any;
  }
}
