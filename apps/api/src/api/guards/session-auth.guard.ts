import { CanActivate, ExecutionContext, Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and, gt } from 'drizzle-orm';
import Redis from 'ioredis';
import { sessions, users } from '@shot/db';
import { DRIZZLE } from '../../providers/drizzle.provider';
import { REDIS } from '../../providers/redis.provider';
import type { Database } from '@shot/db';
import { hashToken } from '../../utils/hash';
import { SESSION_CACHE_TTL_SECONDS } from '../../constants';
import { InvalidSessionException } from '../../auth/exceptions/invalid-session.exception';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  private readonly logger = new Logger(SessionAuthGuard.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new InvalidSessionException('Missing or invalid authorization header');
    }

    const token = authHeader.slice(7);
    const tokenHash = hashToken(token);
    const cacheKey = `session:${tokenHash}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      this.logger.debug('Session cache hit');
      request.user = JSON.parse(cached);
      return true;
    }

    this.logger.debug('Session cache miss, querying database');

    const result = await this.db
      .select({
        session_id: sessions.id,
        user_id: users.id,
        email: users.email,
        display_name: users.display_name,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.user_id, users.id))
      .where(and(eq(sessions.token_hash, tokenHash), gt(sessions.expires_at, new Date())))
      .limit(1);

    if (result.length === 0) {
      this.logger.warn('Invalid or expired session');
      throw new InvalidSessionException();
    }

    const userData = result[0];
    await this.redis.set(cacheKey, JSON.stringify(userData), 'EX', SESSION_CACHE_TTL_SECONDS);
    request.user = userData;
    return true;
  }
}
