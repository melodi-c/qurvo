import { CanActivate, ExecutionContext, Injectable, Inject, UnauthorizedException, HttpException, HttpStatus, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { eq, and, isNull } from 'drizzle-orm';
import Redis from 'ioredis';
import { apiKeys, projects, plans } from '@qurvo/db';
import type { Database } from '@qurvo/db';
import { API_KEY_HEADER, API_KEY_CACHE_TTL_SECONDS, billingCounterKey } from '../constants';
import { REDIS } from '../providers/redis.provider';
import { DRIZZLE } from '../providers/drizzle.provider';

interface CachedKeyInfo {
  project_id: string;
  key_id: string;
  expires_at: string | null;
  events_limit: number | null;
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers[API_KEY_HEADER];

    if (!apiKey || typeof apiKey !== 'string') {
      throw new UnauthorizedException('Missing API key');
    }

    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const cacheKey = `apikey:${keyHash}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      this.logger.debug('API key cache hit');
      const info: CachedKeyInfo = JSON.parse(cached);
      if (info.expires_at && new Date(info.expires_at) < new Date()) {
        throw new UnauthorizedException('API key expired');
      }
      await this.checkEventsLimit(info);
      request.projectId = info.project_id;
      request.apiKeyId = info.key_id;
      return true;
    }

    this.logger.debug('API key cache miss, querying database');

    const result = await this.db
      .select({
        key_id: apiKeys.id,
        project_id: apiKeys.project_id,
        expires_at: apiKeys.expires_at,
        events_limit: plans.events_limit,
      })
      .from(apiKeys)
      .innerJoin(projects, eq(apiKeys.project_id, projects.id))
      .leftJoin(plans, eq(projects.plan_id, plans.id))
      .where(and(eq(apiKeys.key_hash, keyHash), isNull(apiKeys.revoked_at)))
      .limit(1);

    if (result.length === 0) {
      this.logger.warn('Invalid API key');
      throw new UnauthorizedException('Invalid API key');
    }

    const keyInfo = result[0];

    if (keyInfo.expires_at && keyInfo.expires_at < new Date()) {
      this.logger.warn({ keyId: keyInfo.key_id }, 'Expired API key');
      throw new UnauthorizedException('API key expired');
    }

    const info: CachedKeyInfo = {
      project_id: keyInfo.project_id,
      key_id: keyInfo.key_id,
      expires_at: keyInfo.expires_at?.toISOString() ?? null,
      events_limit: keyInfo.events_limit ?? null,
    };
    await this.redis.set(cacheKey, JSON.stringify(info), 'EX', API_KEY_CACHE_TTL_SECONDS);

    this.db.update(apiKeys).set({ last_used_at: new Date() }).where(eq(apiKeys.id, keyInfo.key_id))
      .catch((err: unknown) => this.logger.error({ err, keyId: keyInfo.key_id }, 'Failed to update last_used_at'));

    this.logger.debug({ projectId: keyInfo.project_id }, 'API key authenticated');

    await this.checkEventsLimit(info);

    request.projectId = keyInfo.project_id;
    request.apiKeyId = keyInfo.key_id;
    return true;
  }

  // Soft limit: check and increment are non-atomic. Under concurrent load, a small
  // over-count is possible. This is acceptable for billing — events are never lost,
  // and the counter self-corrects. For hard limits, use a Lua script.
  private async checkEventsLimit(info: CachedKeyInfo): Promise<void> {
    if (info.events_limit === null) return;

    const counterKey = billingCounterKey(info.project_id);
    const current = await this.redis.get(counterKey);

    if (current !== null && parseInt(current, 10) >= info.events_limit) {
      this.logger.warn({ projectId: info.project_id, current, limit: info.events_limit }, 'Event limit exceeded');
      throw new HttpException('Monthly event limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
