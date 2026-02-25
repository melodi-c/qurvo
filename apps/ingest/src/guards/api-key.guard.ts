import { CanActivate, ExecutionContext, Injectable, Inject, UnauthorizedException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { eq } from 'drizzle-orm';
import Redis from 'ioredis';
import { apiKeys, projects, plans } from '@qurvo/db';
import type { Database } from '@qurvo/db';
import { REDIS, DRIZZLE, API_KEY_HEADER, API_KEY_CACHE_TTL_SECONDS } from '../constants';

interface CachedKeyInfo {
  project_id: string;
  key_id: string;
  expires_at: string | null;
  revoked_at: string | null;
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
    const request = context.switchToHttp().getRequest<import('fastify').FastifyRequest>();

    const fromHeader = request.headers[API_KEY_HEADER];
    const fromBody = (request.body as Record<string, unknown> | null)?.api_key;
    const apiKey = (typeof fromHeader === 'string' && fromHeader) || (typeof fromBody === 'string' && fromBody) || null;

    if (!apiKey) {
      throw new UnauthorizedException('Missing API key');
    }

    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const cacheKey = `apikey:${keyHash}`;

    let cached: string | null = null;
    try {
      cached = await this.redis.get(cacheKey);
    } catch (err) {
      this.logger.error({ err }, 'Redis error reading API key cache — falling back to DB');
    }

    if (cached) {
      this.logger.debug('API key cache hit');
      const info: CachedKeyInfo = JSON.parse(cached);
      if (info.revoked_at) {
        throw new UnauthorizedException('API key revoked');
      }
      if (info.expires_at && new Date(info.expires_at) < new Date()) {
        throw new UnauthorizedException('API key expired');
      }
      request.projectId = info.project_id;
      request.eventsLimit = info.events_limit;
      request.quotaLimited = false;
      return true;
    }

    this.logger.debug('API key cache miss, querying database');

    const result = await this.db
      .select({
        key_id: apiKeys.id,
        project_id: apiKeys.project_id,
        expires_at: apiKeys.expires_at,
        revoked_at: apiKeys.revoked_at,
        events_limit: plans.events_limit,
      })
      .from(apiKeys)
      .innerJoin(projects, eq(apiKeys.project_id, projects.id))
      .leftJoin(plans, eq(projects.plan_id, plans.id))
      .where(eq(apiKeys.key_hash, keyHash))
      .limit(1);

    if (result.length === 0) {
      this.logger.warn('Invalid API key');
      throw new UnauthorizedException('Invalid API key');
    }

    const keyInfo = result[0];

    if (keyInfo.revoked_at) {
      this.logger.warn({ keyId: keyInfo.key_id }, 'Revoked API key');
      throw new UnauthorizedException('API key revoked');
    }

    if (keyInfo.expires_at && keyInfo.expires_at < new Date()) {
      this.logger.warn({ keyId: keyInfo.key_id }, 'Expired API key');
      throw new UnauthorizedException('API key expired');
    }

    const info: CachedKeyInfo = {
      project_id: keyInfo.project_id,
      key_id: keyInfo.key_id,
      expires_at: keyInfo.expires_at?.toISOString() ?? null,
      revoked_at: null,
      events_limit: keyInfo.events_limit ?? null,
    };
    this.redis.set(cacheKey, JSON.stringify(info), 'EX', API_KEY_CACHE_TTL_SECONDS)
      .catch((err: unknown) => this.logger.error({ err }, 'Failed to write API key cache'));

    this.db.update(apiKeys).set({ last_used_at: new Date() }).where(eq(apiKeys.id, keyInfo.key_id))
      .execute()
      .catch((err: unknown) => this.logger.error({ err, keyId: keyInfo.key_id }, 'Failed to update last_used_at'));

    this.logger.debug({ projectId: keyInfo.project_id }, 'API key authenticated');

    request.projectId = keyInfo.project_id;
    request.eventsLimit = keyInfo.events_limit;
    request.quotaLimited = false;
    return true;
  }
}
