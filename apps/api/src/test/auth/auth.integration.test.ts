import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID, randomBytes } from 'crypto';
import { setupContainers, type ContainerContext } from '@qurvo/testing';
import { eq, count } from 'drizzle-orm';
import { users, sessions, emailVerificationCodes } from '@qurvo/db';
import { AuthService } from '../../auth/auth.service';
import { VerificationService } from '../../verification/verification.service';
import { AccountService } from '../../auth/account.service';
import { EmailConflictException } from '../../auth/exceptions/email-conflict.exception';
import { InvalidCredentialsException } from '../../auth/exceptions/invalid-credentials.exception';
import { TooManyRequestsException } from '../../exceptions/too-many-requests.exception';
import { VerificationCooldownException } from '../../verification/exceptions/verification-cooldown.exception';
import { InvalidVerificationCodeException } from '../../verification/exceptions/invalid-verification-code.exception';
import { EmailAlreadyVerifiedException } from '../../verification/exceptions/email-already-verified.exception';
import { WrongPasswordException } from '../../auth/exceptions/wrong-password.exception';
import { hashToken } from '../../utils/hash';
import { SESSION_CACHE_KEY_PREFIX, MAX_ACTIVE_SESSIONS_PER_USER } from '../../constants';
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
  return new AuthService(c.db as any, c.redis as any, verificationService);
}

function makeVerificationService(c: ContainerContext): VerificationService {
  return new VerificationService(c.db as any, c.redis as any, mockEmailProvider);
}

function makeAccountService(c: ContainerContext): AccountService {
  return new AccountService(c.db as any, c.redis as any);
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

// ---------------------------------------------------------------------------
// AuthService — login rate limiting
// ---------------------------------------------------------------------------

describe('AuthService.login — rate limiting', () => {
  it('blocks login after LOGIN_MAX_ATTEMPTS (5) failed attempts', async () => {
    const authService = makeAuthService(ctx);
    const email = `ratelimit-block-${randomUUID()}@example.com`;

    await authService.register({ email, password: 'realpass', display_name: 'U' });

    // Exhaust 5 attempts
    for (let i = 0; i < 5; i++) {
      await authService.login({ email, password: 'wrong' }).catch(() => {});
    }

    // 6th attempt — should be blocked even with correct password
    await expect(
      authService.login({ email, password: 'realpass' }),
    ).rejects.toThrow(TooManyRequestsException);
  });
});

// ---------------------------------------------------------------------------
// AuthService — max active sessions
// ---------------------------------------------------------------------------

describe('AuthService — max active sessions', () => {
  it(`evicts oldest session when ${MAX_ACTIVE_SESSIONS_PER_USER} sessions are active`, async () => {
    const authService = makeAuthService(ctx);
    const email = `maxsessions-${randomUUID()}@example.com`;

    await authService.register({ email, password: 'pass', display_name: 'Sessions User' });

    // Create MAX_ACTIVE_SESSIONS_PER_USER sessions (first one from register + MAX-1 logins)
    const tokens: string[] = [];
    for (let i = 0; i < MAX_ACTIVE_SESSIONS_PER_USER; i++) {
      const { token } = await authService.login({ email, password: 'pass' });
      tokens.push(token);
    }

    // Verify we have exactly MAX_ACTIVE_SESSIONS_PER_USER sessions
    const [{ value: sessionsBefore }] = await ctx.db
      .select({ value: count() })
      .from(sessions)
      .where(
        eq(sessions.user_id,
          (await ctx.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1))[0].id,
        ),
      );
    expect(Number(sessionsBefore)).toBe(MAX_ACTIVE_SESSIONS_PER_USER);

    // One more login — should evict the oldest session
    const oldestToken = tokens[0];
    const oldestTokenHash = hashToken(oldestToken);

    await authService.login({ email, password: 'pass' });

    // The oldest session should be gone
    const [evictedSession] = await ctx.db
      .select()
      .from(sessions)
      .where(eq(sessions.token_hash, oldestTokenHash))
      .limit(1);
    expect(evictedSession).toBeUndefined();

    // Total session count stays at MAX
    const [userId] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    const [{ value: sessionsAfter }] = await ctx.db
      .select({ value: count() })
      .from(sessions)
      .where(eq(sessions.user_id, userId.id));
    expect(Number(sessionsAfter)).toBe(MAX_ACTIVE_SESSIONS_PER_USER);
  });
});

// ---------------------------------------------------------------------------
// AuthService — logout
// ---------------------------------------------------------------------------

describe('AuthService.logout', () => {
  it('removes session from DB on logout', async () => {
    const authService = makeAuthService(ctx);
    const email = `logout-${randomUUID()}@example.com`;

    const { token } = await authService.register({ email, password: 'pass', display_name: 'U' });
    const tokenHash = hashToken(token);

    // Verify session exists
    const [sessionBefore] = await ctx.db
      .select()
      .from(sessions)
      .where(eq(sessions.token_hash, tokenHash))
      .limit(1);
    expect(sessionBefore).toBeDefined();

    await authService.logout(token);

    // Session should be gone from DB
    const [sessionAfter] = await ctx.db
      .select()
      .from(sessions)
      .where(eq(sessions.token_hash, tokenHash))
      .limit(1);
    expect(sessionAfter).toBeUndefined();
  });

  it('removes session from Redis cache on logout', async () => {
    const authService = makeAuthService(ctx);
    const email = `logout-redis-${randomUUID()}@example.com`;

    const { token } = await authService.register({ email, password: 'pass', display_name: 'U' });
    const tokenHash = hashToken(token);
    const cacheKey = `${SESSION_CACHE_KEY_PREFIX}${tokenHash}`;

    // Manually plant a cache entry to simulate a cached session
    await ctx.redis.set(cacheKey, JSON.stringify({ userId: 'test' }), 'EX', 60);

    await authService.logout(token);

    const cached = await ctx.redis.get(cacheKey);
    expect(cached).toBeNull();
  });
});

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
