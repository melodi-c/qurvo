import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
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
    @Param('projectId') projectId: string,
  ): Promise<MemberDto[]> {
    return this.membersService.listMembers(projectId) as any;
  }

  @RequireRole('owner')
  @Patch(':memberId/role')
  async updateRole(
    @Param('projectId') projectId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() body: UpdateMemberRoleDto,
  ): Promise<MemberDto> {
    return this.membersService.updateMemberRole(projectId, memberId, body.role) as any;
  }

  @RequireRole('owner')
  @Delete(':memberId')
  async removeMember(
    @Param('projectId') projectId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ): Promise<void> {
    await this.membersService.removeMember(projectId, memberId);
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
    @Param('projectId') projectId: string,
  ): Promise<InviteDto[]> {
    return this.membersService.listInvites(projectId) as any;
  }

  @RequireRole('owner')
  @Post()
  async createInvite(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Body() body: CreateInviteDto,
  ): Promise<InviteDto> {
    return this.membersService.createInvite(user.user_id, projectId, body) as any;
  }

  @RequireRole('owner')
  @Delete(':inviteId')
  async cancelInvite(
    @Param('projectId') projectId: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
  ): Promise<void> {
    await this.membersService.cancelInvite(projectId, inviteId);
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
    return this.membersService.getMyInvites(user.email) as any;
  }

  @Post(':inviteId/accept')
  async acceptInvite(
    @CurrentUser() user: RequestUser,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
  ): Promise<void> {
    await this.membersService.respondToInvite(user.user_id, user.email, inviteId, 'accept');
  }

  @Post(':inviteId/decline')
  async declineInvite(
    @CurrentUser() user: RequestUser,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
  ): Promise<void> {
    await this.membersService.respondToInvite(user.user_id, user.email, inviteId, 'decline');
  }
}
