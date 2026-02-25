import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import Redis from 'ioredis';
import { users } from '@qurvo/db';
import { DRIZZLE } from '../providers/drizzle.provider';
import { REDIS } from '../providers/redis.provider';
import type { Database } from '@qurvo/db';
import { invalidateUserSessionCaches } from '../utils/session-cache';
import { InvalidCredentialsException } from './exceptions/invalid-credentials.exception';
import { WrongPasswordException } from './exceptions/wrong-password.exception';
import { buildConditionalUpdate } from '../utils/build-conditional-update';

const USER_PROFILE_COLUMNS = {
  id: users.id,
  email: users.email,
  display_name: users.display_name,
  language: users.language,
  email_verified: users.email_verified,
};

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async updateProfile(userId: string, input: { display_name?: string; language?: string }) {
    const setFields = buildConditionalUpdate(input, ['display_name', 'language']);

    if (Object.keys(setFields).length === 0) {
      const [user] = await this.db
        .select(USER_PROFILE_COLUMNS)
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return { user };
    }

    setFields.updated_at = new Date();

    const [updated] = await this.db
      .update(users)
      .set(setFields)
      .where(eq(users.id, userId))
      .returning(USER_PROFILE_COLUMNS);

    await invalidateUserSessionCaches(this.db, this.redis, userId);
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
      this.logger.warn({ userId }, 'Password change failed: wrong current password');
      throw new WrongPasswordException();
    }

    const password_hash = await argon2.hash(newPassword);
    await this.db
      .update(users)
      .set({ password_hash, updated_at: new Date() })
      .where(eq(users.id, userId));

    await invalidateUserSessionCaches(this.db, this.redis, userId);
    this.logger.log({ userId }, 'Password changed');
  }
}
