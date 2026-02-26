import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { setupContainers, type ContainerContext } from '@qurvo/testing';
import { eq } from 'drizzle-orm';
import { users, sessions } from '@qurvo/db';
import { AuthService } from '../../auth/auth.service';
import { VerificationService } from '../../verification/verification.service';
import { ProjectsService } from '../../projects/projects.service';
import { DemoSeedService } from '../../demo/demo-seed.service';
import { EmailConflictException } from '../../auth/exceptions/email-conflict.exception';
import { InvalidCredentialsException } from '../../auth/exceptions/invalid-credentials.exception';
import { hashToken } from '../../utils/hash';
import type { EmailProvider } from '../../email/email.provider.interface';

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
  const projectsService = new ProjectsService(c.db as any, c.redis as any);
  const demoSeedService = { seed: async () => {} } as unknown as DemoSeedService;
  return new AuthService(c.db as any, c.redis as any, verificationService, projectsService, demoSeedService);
}

beforeAll(async () => {
  ctx = await setupContainers();
}, 120_000);

// ---------------------------------------------------------------------------
// AuthService — register
// ---------------------------------------------------------------------------

describe('AuthService.register', () => {
  it('successfully registers a user and returns a token', async () => {
    const authService = makeAuthService(ctx);
    const email = `register-${randomUUID()}@example.com`;

    const result = await authService.register({
      email,
      password: 'secret123',
      display_name: 'Test User',
    });

    expect(result.token).toBeTruthy();
    expect(typeof result.token).toBe('string');
    expect(result.user.email).toBe(email);
    expect(result.user.display_name).toBe('Test User');
    expect(result.user.email_verified).toBe(false);
    expect(result.user.id).toBeTruthy();

    // Verify user exists in DB
    const [dbUser] = await ctx.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    expect(dbUser).toBeDefined();
    expect(dbUser.display_name).toBe('Test User');
  });

  it('creates a session record in DB on register', async () => {
    const authService = makeAuthService(ctx);
    const email = `register-session-${randomUUID()}@example.com`;

    const result = await authService.register({
      email,
      password: 'secret123',
      display_name: 'Session User',
    });

    const tokenHash = hashToken(result.token);
    const [session] = await ctx.db
      .select()
      .from(sessions)
      .where(eq(sessions.token_hash, tokenHash))
      .limit(1);

    expect(session).toBeDefined();
    expect(session.user_id).toBe(result.user.id);
    expect(session.expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  it('throws EmailConflictException (409) on duplicate email', async () => {
    const authService = makeAuthService(ctx);
    const email = `duplicate-${randomUUID()}@example.com`;

    await authService.register({ email, password: 'pass1', display_name: 'First' });

    await expect(
      authService.register({ email, password: 'pass2', display_name: 'Second' }),
    ).rejects.toThrow(EmailConflictException);
  });
});

// ---------------------------------------------------------------------------
// AuthService — login
// ---------------------------------------------------------------------------

describe('AuthService.login', () => {
  it('successfully logs in with correct credentials', async () => {
    const authService = makeAuthService(ctx);
    const email = `login-ok-${randomUUID()}@example.com`;

    await authService.register({ email, password: 'correct-pass', display_name: 'Login User' });

    const result = await authService.login({ email, password: 'correct-pass' });

    expect(result.token).toBeTruthy();
    expect(result.user.email).toBe(email);
  });

  it('throws InvalidCredentialsException for wrong password', async () => {
    const authService = makeAuthService(ctx);
    const email = `login-bad-pass-${randomUUID()}@example.com`;

    await authService.register({ email, password: 'correct', display_name: 'User' });

    await expect(
      authService.login({ email, password: 'wrong-password' }),
    ).rejects.toThrow(InvalidCredentialsException);
  });

  it('throws InvalidCredentialsException for non-existent user', async () => {
    const authService = makeAuthService(ctx);
    const email = `nonexistent-${randomUUID()}@example.com`;

    await expect(
      authService.login({ email, password: 'any-pass' }),
    ).rejects.toThrow(InvalidCredentialsException);
  });

  it('both wrong-password and non-existent-user throw the same InvalidCredentialsException type', async () => {
    const authService = makeAuthService(ctx);
    const email = `same-error-${randomUUID()}@example.com`;
    await authService.register({ email, password: 'realpass', display_name: 'U' });

    const [errWrong, errMissing] = await Promise.all([
      authService.login({ email, password: 'wrongpass' }).catch((e) => e),
      authService.login({ email: `noexist-${randomUUID()}@x.com`, password: 'p' }).catch((e) => e),
    ]);

    expect(errWrong).toBeInstanceOf(InvalidCredentialsException);
    expect(errMissing).toBeInstanceOf(InvalidCredentialsException);
    expect(errWrong.name).toBe(errMissing.name);
  });

  it('resets rate limit counter on successful login', async () => {
    const authService = makeAuthService(ctx);
    const email = `ratelimit-reset-${randomUUID()}@example.com`;

    await authService.register({ email, password: 'realpass', display_name: 'U' });

    // Fail a couple of times
    for (let i = 0; i < 2; i++) {
      await authService.login({ email, password: 'bad' }).catch(() => {});
    }

    // Successful login — should clear the counter
    await authService.login({ email, password: 'realpass' });

    // After reset, should be able to fail again without being blocked
    await authService.login({ email, password: 'bad' }).catch(() => {});
    const rateLimitKey = `login_attempts:${email}`;
    const attempts = await ctx.redis.get(rateLimitKey);
    expect(parseInt(attempts ?? '0')).toBe(1);
  });
});
