import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { projectMembers, projectInvites, users, projects } from '@qurvo/db';
import { DRIZZLE } from '../providers/drizzle.provider';
import type { Database } from '@qurvo/db';
import { InsufficientPermissionsException } from '../exceptions/insufficient-permissions.exception';
import { InviteNotFoundException } from './exceptions/invite-not-found.exception';
import { InviteConflictException } from './exceptions/invite-conflict.exception';
import { AlreadyMemberException } from './exceptions/already-member.exception';
import { CannotRemoveOwnerException } from './exceptions/cannot-remove-owner.exception';
import { MemberNotFoundException } from './exceptions/member-not-found.exception';
import { AppBadRequestException } from '../exceptions/app-bad-request.exception';

const MEMBER_COLUMNS = {
  id: projectMembers.id,
  project_id: projectMembers.project_id,
  role: projectMembers.role,
  created_at: projectMembers.created_at,
  user: {
    id: users.id,
    email: users.email,
    display_name: users.display_name,
  },
};

const INVITE_COLUMNS = {
  id: projectInvites.id,
  project_id: projectInvites.project_id,
  email: projectInvites.email,
  role: projectInvites.role,
  status: projectInvites.status,
  created_at: projectInvites.created_at,
  responded_at: projectInvites.responded_at,
  invited_by: {
    id: users.id,
    email: users.email,
    display_name: users.display_name,
  },
};

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  // Members

  async listMembers(projectId: string) {
    return this.db
      .select(MEMBER_COLUMNS)
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.user_id, users.id))
      .where(eq(projectMembers.project_id, projectId))
      .orderBy(projectMembers.created_at);
  }

  async updateMemberRole(projectId: string, memberId: string, role: 'editor' | 'viewer') {
    const [target] = await this.db
      .select({ role: projectMembers.role })
      .from(projectMembers)
      .where(and(eq(projectMembers.id, memberId), eq(projectMembers.project_id, projectId)))
      .limit(1);
    if (!target) {throw new MemberNotFoundException();}
    if (target.role === 'owner') {throw new InsufficientPermissionsException('Cannot change owner role');}

    await this.db.update(projectMembers).set({ role }).where(eq(projectMembers.id, memberId));

    const hydrated = await this.hydrateMember(memberId);
    this.logger.log({ memberId, projectId, role }, 'Member role updated');
    return hydrated;
  }

  async removeMember(projectId: string, memberId: string) {
    const [target] = await this.db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.id, memberId), eq(projectMembers.project_id, projectId)))
      .limit(1);
    if (!target) {throw new MemberNotFoundException();}
    if (target.role === 'owner') {throw new CannotRemoveOwnerException();}

    await this.db.delete(projectMembers).where(and(eq(projectMembers.id, memberId), eq(projectMembers.project_id, projectId)));
    this.logger.log({ memberId, projectId }, 'Member removed');
  }

  // Invites

  async listInvites(projectId: string) {
    return this.db
      .select(INVITE_COLUMNS)
      .from(projectInvites)
      .innerJoin(users, eq(projectInvites.invited_by, users.id))
      .where(and(eq(projectInvites.project_id, projectId), eq(projectInvites.status, 'pending')))
      .orderBy(projectInvites.created_at);
  }

  async createInvite(userId: string, projectId: string, input: { email: string; role: 'editor' | 'viewer' }) {
    const invite = await this.db.transaction(async (tx) => {
      // Verify user exists
      const [targetUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);
      if (!targetUser) {throw new AppBadRequestException('Unable to invite this email');}

      // Check if already a member
      const [existingMember] = await tx
        .select({ id: projectMembers.id })
        .from(projectMembers)
        .where(and(eq(projectMembers.user_id, targetUser.id), eq(projectMembers.project_id, projectId)))
        .limit(1);
      if (existingMember) {throw new AlreadyMemberException();}

      // Check for existing pending invite
      const [existingInvite] = await tx
        .select({ id: projectInvites.id })
        .from(projectInvites)
        .where(and(
          eq(projectInvites.project_id, projectId),
          eq(projectInvites.email, input.email),
          eq(projectInvites.status, 'pending'),
        ))
        .limit(1);
      if (existingInvite) {throw new InviteConflictException();}

      const [created] = await tx
        .insert(projectInvites)
        .values({ project_id: projectId, invited_by: userId, email: input.email, role: input.role })
        .returning();
      return created;
    });

    this.logger.log({ inviteId: invite.id, projectId, email: input.email }, 'Invite created');
    return this.hydrateInvite(invite.id);
  }

  async cancelInvite(projectId: string, inviteId: string) {
    const [invite] = await this.db
      .select()
      .from(projectInvites)
      .where(and(eq(projectInvites.id, inviteId), eq(projectInvites.project_id, projectId)))
      .limit(1);
    if (!invite) {throw new InviteNotFoundException();}
    if (invite.status !== 'pending') {throw new InviteNotFoundException('Invite is no longer pending');}

    await this.db.update(projectInvites)
      .set({ status: 'cancelled', responded_at: new Date() })
      .where(eq(projectInvites.id, inviteId));
    this.logger.log({ inviteId, projectId }, 'Invite cancelled');
  }

  // Recipient side

  async getMyInvites(email: string) {
    return this.db
      .select({
        id: projectInvites.id,
        role: projectInvites.role,
        status: projectInvites.status,
        created_at: projectInvites.created_at,
        project: { id: projects.id, name: projects.name },
        invited_by: {
          id: users.id,
          email: users.email,
          display_name: users.display_name,
        },
      })
      .from(projectInvites)
      .innerJoin(projects, eq(projectInvites.project_id, projects.id))
      .innerJoin(users, eq(projectInvites.invited_by, users.id))
      .where(and(eq(projectInvites.email, email), eq(projectInvites.status, 'pending')))
      .orderBy(projectInvites.created_at);
  }

  async respondToInvite(userId: string, email: string, inviteId: string, action: 'accept' | 'decline') {
    await this.db.transaction(async (tx) => {
      // Atomic check-and-update: only succeeds if invite is still pending
      const [invite] = await tx.update(projectInvites)
        .set({ status: action === 'accept' ? 'accepted' : 'declined', responded_at: new Date() })
        .where(and(
          eq(projectInvites.id, inviteId),
          eq(projectInvites.email, email),
          eq(projectInvites.status, 'pending'),
        ))
        .returning();
      if (!invite) {throw new InviteNotFoundException();}

      if (action === 'accept') {
        await tx.insert(projectMembers).values({
          project_id: invite.project_id,
          user_id: userId,
          role: invite.role,
        });
      }
    });
    this.logger.log({ inviteId, userId, action }, 'Invite responded');
  }

  // Private helpers

  private async hydrateMember(memberId: string) {
    const [hydrated] = await this.db
      .select(MEMBER_COLUMNS)
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.user_id, users.id))
      .where(eq(projectMembers.id, memberId));
    return hydrated;
  }

  private async hydrateInvite(inviteId: string) {
    const [hydrated] = await this.db
      .select(INVITE_COLUMNS)
      .from(projectInvites)
      .innerJoin(users, eq(projectInvites.invited_by, users.id))
      .where(eq(projectInvites.id, inviteId));
    return hydrated;
  }
}
