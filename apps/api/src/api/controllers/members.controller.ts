import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MembersService } from '../../members/members.service';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { RequireRole } from '../decorators/require-role.decorator';
import {
  CreateInviteDto,
  UpdateMemberRoleDto,
  MemberDto,
  InviteDto,
  MyInviteDto,
} from '../dto/members.dto';
import { ProjectMemberGuard } from '../guards/project-member.guard';

// ── Project-scoped member management ──────────────────────────────────────────

@ApiTags('Members')
@ApiBearerAuth()
@Controller('api/projects/:projectId/members')
@UseGuards(ProjectMemberGuard)
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  async listMembers(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
  ): Promise<MemberDto[]> {
    return this.membersService.listMembers(user.user_id, projectId);
  }

  @RequireRole('owner')
  @Put(':memberId/role')
  async updateRole(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('memberId') memberId: string,
    @Body() body: UpdateMemberRoleDto,
  ): Promise<MemberDto> {
    return this.membersService.updateMemberRole(user.user_id, projectId, memberId, body.role);
  }

  @RequireRole('owner')
  @Delete(':memberId')
  async removeMember(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('memberId') memberId: string,
  ): Promise<void> {
    await this.membersService.removeMember(user.user_id, projectId, memberId);
  }
}

// ── Project-scoped invite management ──────────────────────────────────────────

@ApiTags('Invites')
@ApiBearerAuth()
@Controller('api/projects/:projectId/invites')
@UseGuards(ProjectMemberGuard)
export class InvitesController {
  constructor(private readonly membersService: MembersService) {}

  @RequireRole('owner')
  @Get()
  async listInvites(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
  ): Promise<InviteDto[]> {
    return this.membersService.listInvites(user.user_id, projectId);
  }

  @RequireRole('owner')
  @Post()
  async createInvite(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Body() body: CreateInviteDto,
  ): Promise<InviteDto> {
    return this.membersService.createInvite(user.user_id, projectId, body);
  }

  @RequireRole('owner')
  @Delete(':inviteId')
  async cancelInvite(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('inviteId') inviteId: string,
  ): Promise<void> {
    await this.membersService.cancelInvite(user.user_id, projectId, inviteId);
  }
}

// ── User-scoped invite inbox ───────────────────────────────────────────────────

@ApiTags('Invites')
@ApiBearerAuth()
@Controller('api/invites')
export class MyInvitesController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  async getMyInvites(@CurrentUser() user: RequestUser): Promise<MyInviteDto[]> {
    return this.membersService.getMyInvites(user.email);
  }

  @Post(':inviteId/accept')
  async acceptInvite(
    @CurrentUser() user: RequestUser,
    @Param('inviteId') inviteId: string,
  ): Promise<void> {
    await this.membersService.respondToInvite(user.user_id, user.email, inviteId, 'accept');
  }

  @Post(':inviteId/decline')
  async declineInvite(
    @CurrentUser() user: RequestUser,
    @Param('inviteId') inviteId: string,
  ): Promise<void> {
    await this.membersService.respondToInvite(user.user_id, user.email, inviteId, 'decline');
  }
}
