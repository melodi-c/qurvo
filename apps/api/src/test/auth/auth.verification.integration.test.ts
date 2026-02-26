import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID, randomBytes } from 'crypto';
import { setupContainers, type ContainerContext } from '@qurvo/testing';
import { eq } from 'drizzle-orm';
import { users, emailVerificationCodes } from '@qurvo/db';
import { AuthService } from '../../auth/auth.service';
import { VerificationService } from '../../verification/verification.service';
import { ProjectsService } from '../../projects/projects.service';
import { DemoSeedService } from '../../demo/demo-seed.service';
import { TooManyRequestsException } from '../../exceptions/too-many-requests.exception';
import { VerificationCooldownException } from '../../verification/exceptions/verification-cooldown.exception';
import { InvalidVerificationCodeException } from '../../verification/exceptions/invalid-verification-code.exception';
import { EmailAlreadyVerifiedException } from '../../verification/exceptions/email-already-verified.exception';
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

function makeVerificationService(c: ContainerContext): VerificationService {
  return new VerificationService(c.db as any, c.redis as any, mockEmailProvider);
}

beforeAll(async () => {
  ctx = await setupContainers();
}, 120_000);

// ---------------------------------------------------------------------------
// VerificationService — sendVerificationCode
// ---------------------------------------------------------------------------

describe('VerificationService.sendVerificationCode', () => {
  it('creates a verification code record in DB', async () => {
    const verificationService = makeVerificationService(ctx);
    const authService = makeAuthService(ctx);

    const email = `verify-send-${randomUUID()}@example.com`;
    const { user } = await authService.register({ email, password: 'pass', display_name: 'U' });

    // Clear any cooldown from registration
    await ctx.redis.del(`verify_resend:${user.id}`);

    await verificationService.sendVerificationCode(user.id, email);

    const [codeRow] = await ctx.db
      .select()
      .from(emailVerificationCodes)
      .where(eq(emailVerificationCodes.user_id, user.id))
      .limit(1);

    expect(codeRow).toBeDefined();
    expect(codeRow.code).toHaveLength(6);
    expect(codeRow.expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  it('enforces 60-second cooldown on resend', async () => {
    const verificationService = makeVerificationService(ctx);
    const authService = makeAuthService(ctx);

    const email = `verify-cooldown-${randomUUID()}@example.com`;
    const { user } = await authService.register({ email, password: 'pass', display_name: 'U' });

    // Clear registration cooldown
    await ctx.redis.del(`verify_resend:${user.id}`);

    // First send — OK
    await verificationService.sendVerificationCode(user.id, email);

    // Second send immediately — should fail
    await expect(
      verificationService.sendVerificationCode(user.id, email),
    ).rejects.toThrow(VerificationCooldownException);
  });

  it('cooldown exception includes secondsRemaining > 0', async () => {
    const verificationService = makeVerificationService(ctx);
    const authService = makeAuthService(ctx);

    const email = `verify-cooldown-ttl-${randomUUID()}@example.com`;
    const { user } = await authService.register({ email, password: 'pass', display_name: 'U' });

    await ctx.redis.del(`verify_resend:${user.id}`);
    await verificationService.sendVerificationCode(user.id, email);

    const err = await verificationService
      .sendVerificationCode(user.id, email)
      .catch((e) => e);

    expect(err).toBeInstanceOf(VerificationCooldownException);
    expect((err as VerificationCooldownException).secondsRemaining).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// VerificationService — verifyByCode
// ---------------------------------------------------------------------------

describe('VerificationService.verifyByCode', () => {
  it('verifies email with correct code and marks user as verified', async () => {
    const verificationService = makeVerificationService(ctx);
    const authService = makeAuthService(ctx);

    const email = `verify-code-ok-${randomUUID()}@example.com`;
    const { user } = await authService.register({ email, password: 'pass', display_name: 'U' });

    // Clear registration cooldown so we can send a fresh code
    await ctx.redis.del(`verify_resend:${user.id}`);
    await verificationService.sendVerificationCode(user.id, email);

    const [codeRow] = await ctx.db
      .select()
      .from(emailVerificationCodes)
      .where(eq(emailVerificationCodes.user_id, user.id))
      .limit(1);

    await verificationService.verifyByCode(user.id, codeRow.code);

    const [updated] = await ctx.db
      .select({ email_verified: users.email_verified })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    expect(updated.email_verified).toBe(true);
  });

  it('deletes the code record after successful verification', async () => {
    const verificationService = makeVerificationService(ctx);
    const authService = makeAuthService(ctx);

    const email = `verify-cleanup-${randomUUID()}@example.com`;
    const { user } = await authService.register({ email, password: 'pass', display_name: 'U' });

    await ctx.redis.del(`verify_resend:${user.id}`);
    await verificationService.sendVerificationCode(user.id, email);

    const [codeRow] = await ctx.db
      .select()
      .from(emailVerificationCodes)
      .where(eq(emailVerificationCodes.user_id, user.id))
      .limit(1);

    await verificationService.verifyByCode(user.id, codeRow.code);

    const remaining = await ctx.db
      .select()
      .from(emailVerificationCodes)
      .where(eq(emailVerificationCodes.user_id, user.id));

    expect(remaining).toHaveLength(0);
  });

  it('throws InvalidVerificationCodeException for wrong code', async () => {
    const verificationService = makeVerificationService(ctx);
    const authService = makeAuthService(ctx);

    const email = `verify-wrong-${randomUUID()}@example.com`;
    const { user } = await authService.register({ email, password: 'pass', display_name: 'U' });

    await ctx.redis.del(`verify_resend:${user.id}`);
    await verificationService.sendVerificationCode(user.id, email);

    await expect(
      verificationService.verifyByCode(user.id, '000000'),
    ).rejects.toThrow(InvalidVerificationCodeException);
  });

  it('increments attempt counter on wrong code', async () => {
    const verificationService = makeVerificationService(ctx);
    const authService = makeAuthService(ctx);

    const email = `verify-attempts-${randomUUID()}@example.com`;
    const { user } = await authService.register({ email, password: 'pass', display_name: 'U' });

    await ctx.redis.del(`verify_resend:${user.id}`);
    await ctx.redis.del(`verify_attempts:${user.id}`);
    await verificationService.sendVerificationCode(user.id, email);

    await verificationService.verifyByCode(user.id, '000000').catch(() => {});

    const attempts = await ctx.redis.get(`verify_attempts:${user.id}`);
    expect(parseInt(attempts ?? '0')).toBe(1);
  });

  it('blocks verification after VERIFICATION_MAX_ATTEMPTS wrong codes', async () => {
    const verificationService = makeVerificationService(ctx);
    const authService = makeAuthService(ctx);

    const email = `verify-maxattempts-${randomUUID()}@example.com`;
    const { user } = await authService.register({ email, password: 'pass', display_name: 'U' });

    await ctx.redis.del(`verify_resend:${user.id}`);
    await ctx.redis.del(`verify_attempts:${user.id}`);
    await verificationService.sendVerificationCode(user.id, email);

    // Get the real code first so we know it exists
    const [codeRow] = await ctx.db
      .select()
      .from(emailVerificationCodes)
      .where(eq(emailVerificationCodes.user_id, user.id))
      .limit(1);

    // Exhaust all attempts (VERIFICATION_MAX_ATTEMPTS = 10)
    const attemptsKey = `verify_attempts:${user.id}`;
    await ctx.redis.set(attemptsKey, '10', 'EX', 600);

    // Even with correct code, should be blocked
    await expect(
      verificationService.verifyByCode(user.id, codeRow.code),
    ).rejects.toThrow(TooManyRequestsException);
  });

  it('throws EmailAlreadyVerifiedException if user is already verified', async () => {
    const verificationService = makeVerificationService(ctx);
    const authService = makeAuthService(ctx);

    const email = `verify-alreadydone-${randomUUID()}@example.com`;
    const { user } = await authService.register({ email, password: 'pass', display_name: 'U' });

    // Mark verified directly in DB
    await ctx.db.update(users).set({ email_verified: true }).where(eq(users.id, user.id));

    await expect(
      verificationService.verifyByCode(user.id, '123456'),
    ).rejects.toThrow(EmailAlreadyVerifiedException);
  });
});

// ---------------------------------------------------------------------------
// VerificationService — verifyByToken
// ---------------------------------------------------------------------------

describe('VerificationService.verifyByToken', () => {
  it('verifies email with a valid token', async () => {
    const verificationService = makeVerificationService(ctx);
    const authService = makeAuthService(ctx);

    const email = `verify-token-ok-${randomUUID()}@example.com`;
    const { user } = await authService.register({ email, password: 'pass', display_name: 'U' });

    await ctx.redis.del(`verify_resend:${user.id}`);
    await verificationService.sendVerificationCode(user.id, email);

    // We need to retrieve the raw token — it's not stored. Instead get token_hash and
    // manually generate a raw token + hash it ourselves.
    // Actually: verificationService stores token_hash of the raw token.
    // We need the raw token from the DB's stored hash — impossible directly.
    // Instead, intercept by inserting a known token directly.
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Delete existing code, insert one with known token
    await ctx.db.delete(emailVerificationCodes).where(eq(emailVerificationCodes.user_id, user.id));
    await ctx.db.insert(emailVerificationCodes).values({
      user_id: user.id,
      code: '123456',
      token_hash: tokenHash,
      expires_at: expiresAt,
    } as any);

    await verificationService.verifyByToken(rawToken);

    const [updated] = await ctx.db
      .select({ email_verified: users.email_verified })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    expect(updated.email_verified).toBe(true);
  });

  it('throws InvalidVerificationCodeException for unknown token', async () => {
    const verificationService = makeVerificationService(ctx);

    const fakeToken = randomBytes(32).toString('hex');

    await expect(
      verificationService.verifyByToken(fakeToken),
    ).rejects.toThrow(InvalidVerificationCodeException);
  });

  it('throws InvalidVerificationCodeException for expired token', async () => {
    const verificationService = makeVerificationService(ctx);
    const authService = makeAuthService(ctx);

    const email = `verify-token-expired-${randomUUID()}@example.com`;
    const { user } = await authService.register({ email, password: 'pass', display_name: 'U' });

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiredAt = new Date(Date.now() - 1000); // already expired

    await ctx.db.delete(emailVerificationCodes).where(eq(emailVerificationCodes.user_id, user.id));
    await ctx.db.insert(emailVerificationCodes).values({
      user_id: user.id,
      code: '654321',
      token_hash: tokenHash,
      expires_at: expiredAt,
    } as any);

    await expect(
      verificationService.verifyByToken(rawToken),
    ).rejects.toThrow(InvalidVerificationCodeException);
  });
});
