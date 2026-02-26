import { createHash } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable, Inject, UnauthorizedException, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import Redis from 'ioredis';
import { projects } from '@qurvo/db';
import type { Database } from '@qurvo/db';
import { REDIS_KEY } from '@qurvo/nestjs-infra';
import { REDIS, DRIZZLE, API_KEY_HEADER, API_KEY_CACHE_TTL_SECONDS, API_KEY_MAX_LENGTH } from '../constants';

function isValidTokenFormat(token: string): boolean {
  if (token.length > API_KEY_MAX_LENGTH) return false;
  for (let i = 0; i < token.length; i++) {
    const code = token.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) return false; // printable ASCII only
  }
  return true;
}

interface CachedProjectInfo {
  project_id: string;
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
    const token = (typeof fromHeader === 'string' && fromHeader) || (typeof fromBody === 'string' && fromBody) || null;

    if (!token) {
      throw new UnauthorizedException('Missing API key');
    }

    if (!isValidTokenFormat(token)) {
      throw new UnauthorizedException('Invalid API key format');
    }

    const cacheKey = REDIS_KEY.projectToken(token);

    let cached: string | null = null;
    try {
      cached = await this.redis.get(cacheKey);
    } catch (err) {
      this.logger.error({ err }, 'Redis error reading project token cache — falling back to DB');
    }

    if (cached) {
      this.logger.debug('Project token cache hit');
      const info: CachedProjectInfo = JSON.parse(cached);
      request.projectId = info.project_id;
      request.quotaLimited = false;
      return true;
    }

    this.logger.debug('Project token cache miss, querying database');

    // 1. Direct lookup (new format: uuid; or new SDK that knows key_hash already)
    let result = await this.db
      .select({
        project_id: projects.id,
      })
      .from(projects)
      .where(eq(projects.token, token))
      .limit(1);

    // 2. Fallback: hash-lookup for backward compatibility with old SDKs.
    //    Old SDKs sent rawKey (32-char base64url); migration 0037 stored sha256(rawKey)
    //    as projects.token, so hashing the rawKey here will match.
    if (result.length === 0) {
      this.logger.debug('Direct token lookup missed, trying sha256 hash fallback (legacy SDK support)');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const hashCacheKey = REDIS_KEY.projectToken(tokenHash);

      let hashCached: string | null = null;
      try {
        hashCached = await this.redis.get(hashCacheKey);
      } catch (err) {
        this.logger.error({ err }, 'Redis error reading project token hash cache');
      }

      if (hashCached) {
        this.logger.debug('Project token hash cache hit (legacy SDK)');
        const info: CachedProjectInfo = JSON.parse(hashCached);
        request.projectId = info.project_id;
        request.quotaLimited = false;
        return true;
      }

      result = await this.db
        .select({
          project_id: projects.id,
        })
        .from(projects)
        .where(eq(projects.token, tokenHash))
        .limit(1);

      if (result.length > 0) {
        // Cache under the hash key so subsequent legacy-SDK requests hit cache
        const hashInfo: CachedProjectInfo = { project_id: result[0].project_id };
        this.redis
          .set(hashCacheKey, JSON.stringify(hashInfo), 'EX', API_KEY_CACHE_TTL_SECONDS)
          .catch((err: unknown) => this.logger.error({ err }, 'Failed to write project token hash cache'));

        this.logger.debug({ projectId: result[0].project_id }, 'Project token authenticated via sha256 hash fallback (legacy SDK)');
        request.projectId = result[0].project_id;
        request.quotaLimited = false;
        return true;
      }
    }

    if (result.length === 0) {
      this.logger.warn('Invalid project token');
      throw new UnauthorizedException('Invalid API key');
    }

    const projectInfo = result[0];

    const info: CachedProjectInfo = {
      project_id: projectInfo.project_id,
    };
    this.redis.set(cacheKey, JSON.stringify(info), 'EX', API_KEY_CACHE_TTL_SECONDS)
      .catch((err: unknown) => this.logger.error({ err }, 'Failed to write project token cache'));

    this.logger.debug({ projectId: projectInfo.project_id }, 'Project token authenticated');

    request.projectId = projectInfo.project_id;
    request.quotaLimited = false;
    return true;
  }
}
