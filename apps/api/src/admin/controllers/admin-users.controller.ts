import { Controller, Get, Patch, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { eq, sql, count } from 'drizzle-orm';
import type { Database } from '@qurvo/db';
import { users, projects, projectMembers } from '@qurvo/db';
import { Inject } from '@nestjs/common';
import { DRIZZLE } from '../../providers/drizzle.provider';
import { IsStaffGuard } from '../guards/is-staff.guard';
import { CurrentUser, RequestUser } from '../../api/decorators/current-user.decorator';
import {
  PatchUserStaffDto,
  AdminUserDto,
  AdminUserListItemDto,
  AdminUserDetailDto,
} from '../dto/admin.dto';
import { AppForbiddenException } from '../../exceptions/app-forbidden.exception';
import { AppNotFoundException } from '../../exceptions/app-not-found.exception';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(IsStaffGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get()
  async listUsers(): Promise<AdminUserListItemDto[]> {
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

    return rows as any;
  }

  @Get(':id')
  async getUser(@Param('id', ParseUUIDPipe) id: string): Promise<AdminUserDetailDto> {
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
      projects: memberRows,
    } as any;
  }

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
