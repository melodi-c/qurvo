import { CanActivate, ExecutionContext, Injectable, Inject, UnauthorizedException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { eq, and, isNull } from 'drizzle-orm';
import Redis from 'ioredis';
import { apiKeys, projects } from '@shot/db';
import type { Database } from '@shot/db';
import { API_KEY_HEADER, API_KEY_CACHE_TTL_SECONDS } from '../constants';
import { REDIS } from '../providers/redis.provider';
import { DRIZZLE } from '../providers/drizzle.provider';

interface CachedKeyInfo {
  project_id: string;
  key_id: string;
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
      })
      .from(apiKeys)
      .innerJoin(projects, eq(apiKeys.project_id, projects.id))
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

    const info: CachedKeyInfo = { project_id: keyInfo.project_id, key_id: keyInfo.key_id };
    await this.redis.set(cacheKey, JSON.stringify(info), 'EX', API_KEY_CACHE_TTL_SECONDS);

    this.db.update(apiKeys).set({ last_used_at: new Date() }).where(eq(apiKeys.id, keyInfo.key_id))
      .catch((err) => this.logger.error({ err, keyId: keyInfo.key_id }, 'Failed to update last_used_at'));

    this.logger.debug({ projectId: keyInfo.project_id }, 'API key authenticated');

    request.projectId = keyInfo.project_id;
    request.apiKeyId = keyInfo.key_id;
    return true;
  }
}
