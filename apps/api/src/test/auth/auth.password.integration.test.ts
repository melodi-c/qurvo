import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { setupContainers, type ContainerContext } from '@qurvo/testing';
import { AuthService } from '../../auth/auth.service';
import { VerificationService } from '../../verification/verification.service';
import { AccountService } from '../../auth/account.service';
import { ProjectsService } from '../../projects/projects.service';
import { DemoSeedService } from '../../demo/demo-seed.service';
import { InvalidCredentialsException } from '../../auth/exceptions/invalid-credentials.exception';
import { WrongPasswordException } from '../../auth/exceptions/wrong-password.exception';
import type { EmailProvider } from '../../email/email.provider.interface';
import { eq } from 'drizzle-orm';
import { users } from '@qurvo/db';

let ctx: ContainerContext;

/** No-op email provider for tests */
const mockEmailProvider: EmailProvider = {
  sendEmailVerification: async () => {},
};

function makeAuthService(c: ContainerContext): AuthService {
  const verificationService = new VerificationService(
    c.db as any,
    c.redis as any,
    mockEmailProvider,
  );
  const projectsService = new ProjectsService(c.db as any);
  const demoSeedService = { seed: async () => {} } as unknown as DemoSeedService;
  return new AuthService(c.db as any, c.redis as any, verificationService, projectsService, demoSeedService);
}

function makeAccountService(c: ContainerContext): AccountService {
  return new AccountService(c.db as any, c.redis as any);
}

beforeAll(async () => {
  ctx = await setupContainers();
}, 120_000);

// ---------------------------------------------------------------------------
// AccountService — updateProfile
// ---------------------------------------------------------------------------

describe('AccountService.updateProfile', () => {
  it('updates display_name', async () => {
    const authService = makeAuthService(ctx);
    const accountService = makeAccountService(ctx);

    const email = `profile-name-${randomUUID()}@example.com`;
    const { user } = await authService.register({ email, password: 'pass', display_name: 'Original' });

    const result = await accountService.updateProfile(user.id, { display_name: 'Updated Name' });

    expect(result.user.display_name).toBe('Updated Name');

    const [dbUser] = await ctx.db
      .select({ display_name: users.display_name })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    expect(dbUser.display_name).toBe('Updated Name');
  });

  it('returns current user when no fields are provided', async () => {
    const authService = makeAuthService(ctx);
    const accountService = makeAccountService(ctx);

    const email = `profile-noop-${randomUUID()}@example.com`;
    const { user } = await authService.register({ email, password: 'pass', display_name: 'NoChange' });

    const result = await accountService.updateProfile(user.id, {});

    expect(result.user.display_name).toBe('NoChange');
    expect(result.user.id).toBe(user.id);
  });

  it('updates language field', async () => {
    const authService = makeAuthService(ctx);
    const accountService = makeAccountService(ctx);

    const email = `profile-lang-${randomUUID()}@example.com`;
    const { user } = await authService.register({ email, password: 'pass', display_name: 'LangUser' });

    const result = await accountService.updateProfile(user.id, { language: 'en' });

    expect(result.user.language).toBe('en');
  });
});

// ---------------------------------------------------------------------------
// AccountService — changePassword
// ---------------------------------------------------------------------------

describe('AccountService.changePassword', () => {
  it('successfully changes password and allows login with new password', async () => {
    const authService = makeAuthService(ctx);
    const accountService = makeAccountService(ctx);

    const email = `change-pass-${randomUUID()}@example.com`;
    const { user } = await authService.register({ email, password: 'old-pass', display_name: 'U' });

    await accountService.changePassword(user.id, 'old-pass', 'new-pass');

    // Old password should no longer work
    await expect(
      authService.login({ email, password: 'old-pass' }),
    ).rejects.toThrow(InvalidCredentialsException);

    // New password should work
    const result = await authService.login({ email, password: 'new-pass' });
    expect(result.token).toBeTruthy();
  });

  it('throws WrongPasswordException when current password is wrong', async () => {
    const authService = makeAuthService(ctx);
    const accountService = makeAccountService(ctx);

    const email = `change-pass-wrong-${randomUUID()}@example.com`;
    const { user } = await authService.register({ email, password: 'real-pass', display_name: 'U' });

    await expect(
      accountService.changePassword(user.id, 'wrong-pass', 'new-pass'),
    ).rejects.toThrow(WrongPasswordException);
  });
});
