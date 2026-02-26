import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { setupContainers, type ContainerContext } from '@qurvo/testing';
import { eq, count } from 'drizzle-orm';
import { users, sessions } from '@qurvo/db';
import { AuthService } from '../../auth/auth.service';
import { VerificationService } from '../../verification/verification.service';
import { ProjectsService } from '../../projects/projects.service';
import { DemoSeedService } from '../../demo/demo-seed.service';
import { TooManyRequestsException } from '../../exceptions/too-many-requests.exception';
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
  const projectsService = new ProjectsService(c.db as any);
  const demoSeedService = { seed: async () => {} } as unknown as DemoSeedService;
  return new AuthService(c.db as any, c.redis as any, verificationService, projectsService, demoSeedService);
}

beforeAll(async () => {
  ctx = await setupContainers();
}, 120_000);

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
