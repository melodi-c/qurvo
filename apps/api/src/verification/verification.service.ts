import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and, gt } from 'drizzle-orm';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { users, emailVerificationCodes } from '@qurvo/db';
import type { Database } from '@qurvo/db';
import { DRIZZLE } from '../providers/drizzle.provider';
import { REDIS } from '../providers/redis.provider';
import { EMAIL_PROVIDER, type EmailProvider } from '../email/email.provider.interface';
import { hashToken } from '../utils/hash';
import { invalidateUserSessionCaches } from '../utils/session-cache';
import {
  VERIFICATION_CODE_TTL_SECONDS,
  VERIFICATION_RESEND_COOLDOWN_SECONDS,
  VERIFICATION_MAX_ATTEMPTS,
  VERIFICATION_ATTEMPTS_WINDOW_SECONDS,
} from '../constants';
import { InvalidVerificationCodeException } from './exceptions/invalid-verification-code.exception';
import { VerificationCooldownException } from './exceptions/verification-cooldown.exception';
import { EmailAlreadyVerifiedException } from './exceptions/email-already-verified.exception';
import { TooManyRequestsException } from '../exceptions/too-many-requests.exception';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
  ) {}

  async sendVerificationCode(userId: string, email: string): Promise<void> {
    const cooldownKey = `verify_resend:${userId}`;
    const ttl = await this.redis.ttl(cooldownKey);
    if (ttl > 0) {
      throw new VerificationCooldownException(ttl);
    }

    await this.db
      .delete(emailVerificationCodes)
      .where(eq(emailVerificationCodes.user_id, userId));

    const code = crypto.randomInt(100000, 1000000).toString();
    const tokenRaw = crypto.randomBytes(32).toString('hex');
    const token_hash = hashToken(tokenRaw);
    const expires_at = new Date(Date.now() + VERIFICATION_CODE_TTL_SECONDS * 1000);

    await this.db.insert(emailVerificationCodes).values({
      user_id: userId,
      code,
      token_hash,
      expires_at,
    });

    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:5173';
    const verifyUrl = `${baseUrl}/verify-email?token=${tokenRaw}`;

    await this.emailProvider.sendEmailVerification(email, code, verifyUrl);

    await this.redis.set(cooldownKey, '1', 'EX', VERIFICATION_RESEND_COOLDOWN_SECONDS);
    this.logger.log({ userId }, 'Verification code sent');
  }

  async verifyByCode(userId: string, code: string): Promise<void> {
    await this.checkAttempts(userId);
    await this.checkAlreadyVerified(userId);

    const [row] = await this.db
      .select()
      .from(emailVerificationCodes)
      .where(and(
        eq(emailVerificationCodes.user_id, userId),
        gt(emailVerificationCodes.expires_at, new Date()),
      ))
      .limit(1);

    const codeMatch = row && code.length === 6
      && crypto.timingSafeEqual(Buffer.from(row.code), Buffer.from(code));

    if (!codeMatch) {
      await this.incrementAttempts(userId);
      throw new InvalidVerificationCodeException();
    }

    await this.markVerified(userId);
    this.logger.log({ userId }, 'Email verified by code');
  }

  async verifyByToken(tokenRaw: string): Promise<void> {
    const token_hash = hashToken(tokenRaw);

    const [row] = await this.db
      .select({ user_id: emailVerificationCodes.user_id })
      .from(emailVerificationCodes)
      .where(and(
        eq(emailVerificationCodes.token_hash, token_hash),
        gt(emailVerificationCodes.expires_at, new Date()),
      ))
      .limit(1);

    if (!row) {
      throw new InvalidVerificationCodeException('Invalid or expired verification link');
    }

    await this.markVerified(row.user_id);
    this.logger.log({ userId: row.user_id }, 'Email verified by link token');
  }

  private async markVerified(userId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ email_verified: true })
      .where(eq(users.id, userId));

    await this.db
      .delete(emailVerificationCodes)
      .where(eq(emailVerificationCodes.user_id, userId));

    await this.redis.del(`verify_attempts:${userId}`);
    await this.redis.del(`verify_resend:${userId}`);

    await invalidateUserSessionCaches(this.db, this.redis, userId);
  }

  private async checkAlreadyVerified(userId: string): Promise<void> {
    const [userRow] = await this.db
      .select({ email_verified: users.email_verified })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userRow?.email_verified) {
      throw new EmailAlreadyVerifiedException();
    }
  }

  private async checkAttempts(userId: string): Promise<void> {
    const attemptsKey = `verify_attempts:${userId}`;
    const attempts = await this.redis.get(attemptsKey);
    if (attempts && parseInt(attempts) >= VERIFICATION_MAX_ATTEMPTS) {
      throw new TooManyRequestsException('Too many verification attempts, please request a new code');
    }
  }

  private async incrementAttempts(userId: string): Promise<void> {
    const attemptsKey = `verify_attempts:${userId}`;
    await this.redis.incr(attemptsKey);
    await this.redis.expire(attemptsKey, VERIFICATION_ATTEMPTS_WINDOW_SECONDS);
  }
}
