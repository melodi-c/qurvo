import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, asc, gt, and, inArray } from 'drizzle-orm';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { users, sessions } from '@qurvo/db';
import type { InferSelectModel } from 'drizzle-orm';
import { DRIZZLE } from '../providers/drizzle.provider';
import { REDIS } from '../providers/redis.provider';
import type { Database } from '@qurvo/db';
import { SESSION_TOKEN_LENGTH, SESSION_TTL_MS, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_SECONDS, MAX_ACTIVE_SESSIONS_PER_USER, SESSION_CACHE_KEY_PREFIX } from '../constants';

import { hashToken } from '../utils/hash';
import { TooManyRequestsException } from '../exceptions/too-many-requests.exception';
import { EmailConflictException } from './exceptions/email-conflict.exception';
import { InvalidCredentialsException } from './exceptions/invalid-credentials.exception';
import { VerificationService } from '../verification/verification.service';
import { isPgUniqueViolation } from '../utils/pg-errors';
import { DemoSeedService } from '../demo/demo-seed.service';
import { ProjectsService } from '../projects/projects.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly verificationService: VerificationService,
    private readonly projectsService: ProjectsService,
    private readonly demoSeedService: DemoSeedService,
  ) {}

  async register(input: { email: string; password: string; display_name: string }) {
    const password_hash = await argon2.hash(input.password);
    const token = crypto.randomBytes(SESSION_TOKEN_LENGTH).toString('hex');
    const token_hash = hashToken(token);
    const expires_at = new Date(Date.now() + SESSION_TTL_MS);

    let user!: InferSelectModel<typeof users>;
    try {
      user = await this.db.transaction(async (tx) => {
        const [created] = await tx.insert(users).values({
          email: input.email,
          password_hash,
          display_name: input.display_name,
        }).returning();

        await tx.insert(sessions).values({
          user_id: created.id,
          token_hash,
          expires_at,
        });

        return created;
      });
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) throw new EmailConflictException();
      throw err;
    }

    this.logger.log({ userId: user.id }, 'User registered');

    try {
      await this.verificationService.sendVerificationCode(user.id, user.email);
    } catch (err) {
      this.logger.error({ userId: user.id, err }, 'Failed to send verification email');
    }

    // Create demo project and fire-and-forget seeding
    try {
      const demoProject = await this.projectsService.create(user.id, {
        name: 'LearnFlow (Demo)',
        is_demo: true,
        demo_scenario: 'online_school',
      });

      this.demoSeedService.seed(demoProject.id, 'online_school', user.id).catch((err) => {
        this.logger.error({ userId: user.id, projectId: demoProject.id, err }, 'Demo seeding failed');
      });
    } catch (err) {
      this.logger.error({ userId: user.id, err }, 'Failed to create demo project');
    }

    return this.buildAuthResponse(token, user);
  }

  async login(input: { email: string; password: string }, meta?: { ip?: string; userAgent?: string }) {
    const rateLimitKey = `login_attempts:${input.email}`;
    const attempts = await this.redis.get(rateLimitKey);
    if (attempts && parseInt(attempts) >= LOGIN_MAX_ATTEMPTS) {
      this.logger.warn({ email: input.email }, 'Login rate limited');
      throw new TooManyRequestsException('Too many login attempts, try again later');
    }

    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    if (result.length === 0) {
      await this.incrementLoginAttempts(rateLimitKey);
      this.logger.warn({ email: input.email }, 'Login failed: user not found');
      throw new InvalidCredentialsException();
    }

    const user = result[0];
    const valid = await argon2.verify(user.password_hash, input.password);
    if (!valid) {
      await this.incrementLoginAttempts(rateLimitKey);
      this.logger.warn({ email: input.email }, 'Login failed: invalid password');
      throw new InvalidCredentialsException();
    }

    await this.redis.del(rateLimitKey);

    const token = crypto.randomBytes(SESSION_TOKEN_LENGTH).toString('hex');
    const token_hash = hashToken(token);
    const expires_at = new Date(Date.now() + SESSION_TTL_MS);

    const activeSessions = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.user_id, user.id), gt(sessions.expires_at, new Date())))
      .orderBy(asc(sessions.created_at));

    if (activeSessions.length >= MAX_ACTIVE_SESSIONS_PER_USER) {
      const toDelete = activeSessions
        .slice(0, activeSessions.length - MAX_ACTIVE_SESSIONS_PER_USER + 1)
        .map((s) => s.id);
      await this.db.delete(sessions).where(inArray(sessions.id, toDelete));
    }

    await this.db.insert(sessions).values({
      user_id: user.id,
      token_hash,
      ip_address: meta?.ip,
      user_agent: meta?.userAgent,
      expires_at,
    });

    this.logger.log({ userId: user.id }, 'User logged in');

    return this.buildAuthResponse(token, user);
  }

  private buildAuthResponse(token: string, user: InferSelectModel<typeof users>) {
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        language: user.language,
        email_verified: user.email_verified,
      },
    };
  }

  private async incrementLoginAttempts(key: string): Promise<void> {
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, LOGIN_WINDOW_SECONDS);
  }

  async logout(token: string) {
    const token_hash = hashToken(token);
    await this.redis.del(`${SESSION_CACHE_KEY_PREFIX}${token_hash}`);
    await this.db.delete(sessions).where(eq(sessions.token_hash, token_hash));
    this.logger.log('User logged out');
  }

}
