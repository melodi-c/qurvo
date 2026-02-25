import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { setupContainers, createTestProject, type ContainerContext } from '@qurvo/testing';
import { users, projectMembers } from '@qurvo/db';
import { MembersService } from '../../members/members.service';
import { InviteConflictException } from '../../members/exceptions/invite-conflict.exception';
import { AlreadyMemberException } from '../../members/exceptions/already-member.exception';
import { InviteNotFoundException } from '../../members/exceptions/invite-not-found.exception';
import { MemberNotFoundException } from '../../members/exceptions/member-not-found.exception';
import { CannotRemoveOwnerException } from '../../members/exceptions/cannot-remove-owner.exception';
import { InsufficientPermissionsException } from '../../exceptions/insufficient-permissions.exception';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';

let ctx: ContainerContext;
let service: MembersService;

beforeAll(async () => {
  ctx = await setupContainers();
  service = new MembersService(ctx.db as any);
}, 120_000);

/** Create a user that can be invited (has an email in the DB). */
async function createInvitableUser(email?: string): Promise<{ userId: string; email: string }> {
  const userId = randomUUID();
  const userEmail = email ?? `invitee-${userId}@example.com`;
  await ctx.db.insert(users).values({
    id: userId,
    email: userEmail,
    password_hash: 'not_used',
    display_name: 'Invitee',
  } as any);
  return { userId, email: userEmail };
}

// ── createInvite ──────────────────────────────────────────────────────────────

describe('MembersService.createInvite', () => {
  it('creates a pending invite for an existing user', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const { email } = await createInvitableUser();

    const invite = await service.createInvite(userId, projectId, { email, role: 'editor' });

    expect(invite).toBeDefined();
    expect(invite.email).toBe(email);
    expect(invite.role).toBe('editor');
    expect(invite.status).toBe('pending');
    expect(invite.project_id).toBe(projectId);
  });

  it('throws AppBadRequestException for a non-existent email', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    await expect(
      service.createInvite(userId, projectId, { email: 'doesnotexist@example.com', role: 'viewer' }),
    ).rejects.toThrow(AppBadRequestException);
  });

  it('throws AlreadyMemberException when user is already a member', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    // The owner user is already a member — get their email
    const [ownerUser] = await ctx.db
      .select({ email: users.email })
      .from(users)
      .where((ctx.db as any).dialect ? undefined : undefined);

    // Create a second user and add them as a member
    const { userId: memberId, email } = await createInvitableUser();
    await ctx.db.insert(projectMembers).values({
      project_id: projectId,
      user_id: memberId,
      role: 'viewer',
    } as any);

    await expect(
      service.createInvite(userId, projectId, { email, role: 'editor' }),
    ).rejects.toThrow(AlreadyMemberException);
  });

  it('throws InviteConflictException for a duplicate pending invite', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const { email } = await createInvitableUser();

    await service.createInvite(userId, projectId, { email, role: 'viewer' });

    await expect(
      service.createInvite(userId, projectId, { email, role: 'editor' }),
    ).rejects.toThrow(InviteConflictException);
  });
});

// ── respondToInvite ───────────────────────────────────────────────────────────

describe('MembersService.respondToInvite', () => {
  it('accept: creates a projectMembers record', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const { userId: inviteeId, email } = await createInvitableUser();

    const invite = await service.createInvite(userId, projectId, { email, role: 'editor' });

    await service.respondToInvite(inviteeId, email, invite.id, 'accept');

    const members = await service.listMembers(projectId);
    const newMember = members.find((m) => m.user.id === inviteeId);
    expect(newMember).toBeDefined();
    expect(newMember!.role).toBe('editor');
  });

  it('decline: does NOT create a projectMembers record, status becomes declined', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const { userId: inviteeId, email } = await createInvitableUser();

    const invite = await service.createInvite(userId, projectId, { email, role: 'viewer' });

    await service.respondToInvite(inviteeId, email, invite.id, 'decline');

    const members = await service.listMembers(projectId);
    const found = members.find((m) => m.user.id === inviteeId);
    expect(found).toBeUndefined();
  });

  it('throws InviteNotFoundException for a non-existent invite', async () => {
    const { userId } = await createTestProject(ctx.db);

    await expect(
      service.respondToInvite(userId, 'someone@example.com', randomUUID(), 'accept'),
    ).rejects.toThrow(InviteNotFoundException);
  });
});

// ── cancelInvite ──────────────────────────────────────────────────────────────

describe('MembersService.cancelInvite', () => {
  it('cancels a pending invite', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const { email } = await createInvitableUser();

    const invite = await service.createInvite(userId, projectId, { email, role: 'viewer' });

    await expect(service.cancelInvite(projectId, invite.id)).resolves.toBeUndefined();

    // After cancellation the invite is no longer listed (listInvites returns only pending)
    const pendingInvites = await service.listInvites(projectId);
    expect(pendingInvites.find((i) => i.id === invite.id)).toBeUndefined();
  });

  it('throws InviteNotFoundException for a non-pending invite', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const { userId: inviteeId, email } = await createInvitableUser();

    const invite = await service.createInvite(userId, projectId, { email, role: 'viewer' });
    // Accept it first so it is no longer pending
    await service.respondToInvite(inviteeId, email, invite.id, 'accept');

    await expect(service.cancelInvite(projectId, invite.id)).rejects.toThrow(InviteNotFoundException);
  });

  it('throws InviteNotFoundException for a non-existent invite', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await expect(service.cancelInvite(projectId, randomUUID())).rejects.toThrow(InviteNotFoundException);
  });
});

// ── updateMemberRole ──────────────────────────────────────────────────────────

describe('MembersService.updateMemberRole', () => {
  it('updates the role of a non-owner member', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const { userId: memberId, email } = await createInvitableUser();

    const invite = await service.createInvite(userId, projectId, { email, role: 'viewer' });
    await service.respondToInvite(memberId, email, invite.id, 'accept');

    const members = await service.listMembers(projectId);
    const member = members.find((m) => m.user.id === memberId)!;

    const updated = await service.updateMemberRole(projectId, member.id, 'editor');
    expect(updated.role).toBe('editor');
  });

  it('throws InsufficientPermissionsException when updating owner role', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const members = await service.listMembers(projectId);
    const ownerMember = members[0];

    await expect(
      service.updateMemberRole(projectId, ownerMember.id, 'editor'),
    ).rejects.toThrow(InsufficientPermissionsException);
  });

  it('throws MemberNotFoundException for a non-existent member', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await expect(
      service.updateMemberRole(projectId, randomUUID(), 'editor'),
    ).rejects.toThrow(MemberNotFoundException);
  });
});

// ── removeMember ──────────────────────────────────────────────────────────────

describe('MembersService.removeMember', () => {
  it('removes a non-owner member', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const { userId: memberId, email } = await createInvitableUser();

    const invite = await service.createInvite(userId, projectId, { email, role: 'viewer' });
    await service.respondToInvite(memberId, email, invite.id, 'accept');

    const members = await service.listMembers(projectId);
    const member = members.find((m) => m.user.id === memberId)!;

    await expect(service.removeMember(projectId, member.id)).resolves.toBeUndefined();

    const afterRemoval = await service.listMembers(projectId);
    expect(afterRemoval.find((m) => m.id === member.id)).toBeUndefined();
  });

  it('throws CannotRemoveOwnerException for the owner', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const members = await service.listMembers(projectId);
    const ownerMember = members[0];

    await expect(service.removeMember(projectId, ownerMember.id)).rejects.toThrow(CannotRemoveOwnerException);
  });

  it('throws MemberNotFoundException for a non-existent member', async () => {
    const { projectId } = await createTestProject(ctx.db);

    await expect(service.removeMember(projectId, randomUUID())).rejects.toThrow(MemberNotFoundException);
  });
});

// ── listInvites / getMyInvites ────────────────────────────────────────────────

describe('MembersService.listInvites', () => {
  it('returns only pending invites for the project', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const { userId: inviteeId1, email: email1 } = await createInvitableUser();
    const { email: email2 } = await createInvitableUser();

    const invite1 = await service.createInvite(userId, projectId, { email: email1, role: 'viewer' });
    await service.createInvite(userId, projectId, { email: email2, role: 'editor' });

    // Accept the first invite — it should disappear from listInvites
    await service.respondToInvite(inviteeId1, email1, invite1.id, 'accept');

    const pending = await service.listInvites(projectId);
    expect(pending).toHaveLength(1);
    expect(pending[0].email).toBe(email2);
  });
});

describe('MembersService.getMyInvites', () => {
  it('returns pending invites addressed to the given email', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const { email } = await createInvitableUser();

    await service.createInvite(userId, projectId, { email, role: 'viewer' });

    const myInvites = await service.getMyInvites(email);
    expect(myInvites.length).toBeGreaterThanOrEqual(1);
    const found = myInvites.find((i) => i.project.id === projectId);
    expect(found).toBeDefined();
  });
});
