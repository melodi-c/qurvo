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
import { SESSION_TOKEN_LENGTH, SESSION_TTL_DAYS, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_SECONDS, MAX_ACTIVE_SESSIONS_PER_USER } from '../constants';
import { hashToken } from '../utils/hash';
import { TooManyRequestsException } from './exceptions/too-many-requests.exception';
import { EmailConflictException } from './exceptions/email-conflict.exception';
import { InvalidCredentialsException } from './exceptions/invalid-credentials.exception';
import { WrongPasswordException } from './exceptions/wrong-password.exception';
import { VerificationService } from '../verification/verification.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly verificationService: VerificationService,
  ) {}

  async register(input: { email: string; password: string; display_name: string }) {
    const password_hash = await argon2.hash(input.password);
    const token = crypto.randomBytes(SESSION_TOKEN_LENGTH).toString('hex');
    const token_hash = hashToken(token);
    const expires_at = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

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
    } catch (err: any) {
      if (err.code === '23505') {
        throw new EmailConflictException();
      }
      throw err;
    }

    this.logger.log({ userId: user.id }, 'User registered');

    try {
      await this.verificationService.sendVerificationCode(user.id, user.email);
    } catch (err) {
      this.logger.error({ userId: user.id, err }, 'Failed to send verification email');
    }

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        email_verified: false,
      },
    };
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
    const expires_at = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

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

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        email_verified: user.email_verified,
      },
    };
  }

  private async incrementLoginAttempts(key: string): Promise<void> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, LOGIN_WINDOW_SECONDS);
    }
  }

  async logout(token: string) {
    const token_hash = hashToken(token);
    await this.redis.del(`session:${token_hash}`);
    await this.db.delete(sessions).where(eq(sessions.token_hash, token_hash));
    this.logger.log('User logged out');
  }

  async updateProfile(userId: string, input: { display_name: string }) {
    const [updated] = await this.db
      .update(users)
      .set({ display_name: input.display_name, updated_at: new Date() })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        email: users.email,
        display_name: users.display_name,
        email_verified: users.email_verified,
      });

    await this.invalidateUserSessionCaches(userId);
    this.logger.log({ userId }, 'Profile updated');

    return { user: updated };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const [user] = await this.db
      .select({ password_hash: users.password_hash })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new InvalidCredentialsException('User not found');
    }

    const valid = await argon2.verify(user.password_hash, currentPassword);
    if (!valid) {
      throw new WrongPasswordException();
    }

    const password_hash = await argon2.hash(newPassword);
    await this.db
      .update(users)
      .set({ password_hash, updated_at: new Date() })
      .where(eq(users.id, userId));

    await this.invalidateUserSessionCaches(userId);
    this.logger.log({ userId }, 'Password changed');
  }

  private async invalidateUserSessionCaches(userId: string): Promise<void> {
    const userSessions = await this.db
      .select({ token_hash: sessions.token_hash })
      .from(sessions)
      .where(eq(sessions.user_id, userId));

    if (userSessions.length > 0) {
      const cacheKeys = userSessions.map((s) => `session:${s.token_hash}`);
      await this.redis.del(...cacheKeys);
    }
  }
}
