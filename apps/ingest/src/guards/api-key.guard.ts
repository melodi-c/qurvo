import { createHash } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable, Inject, UnauthorizedException, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import Redis from 'ioredis';
import { projects } from '@qurvo/db';
import type { Database } from '@qurvo/db';
import { REDIS_KEY } from '@qurvo/nestjs-infra';
import { REDIS, DRIZZLE, API_KEY_HEADER, API_KEY_CACHE_TTL_SECONDS, API_KEY_MAX_LENGTH } from '../constants';

function extractRawToken(request: FastifyRequest, headerName: string): string | null {
  const fromHeader = request.headers[headerName];
  if (typeof fromHeader === 'string' && fromHeader) { return fromHeader; }
  const fromBody = (request.body as Record<string, unknown> | null)?.api_key;
  if (typeof fromBody === 'string' && fromBody) { return fromBody; }
  return null;
}

function isValidTokenFormat(token: string): boolean {
  if (token.length > API_KEY_MAX_LENGTH) {return false;}
  for (let i = 0; i < token.length; i++) {
    const code = token.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) {return false;} // printable ASCII only
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
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = this.extractToken(request);
    const projectId = await this.resolveProjectId(token);

    request.projectId = projectId;
    request.quotaLimited = false;
    return true;
  }

  private extractToken(request: FastifyRequest): string {
    const token = extractRawToken(request, API_KEY_HEADER);
    if (!token) {
      throw new UnauthorizedException('Missing API key');
    }
    if (!isValidTokenFormat(token)) {
      throw new UnauthorizedException('Invalid API key format');
    }
    return token;
  }

  private async resolveProjectId(token: string): Promise<string> {
    // 1. Try cache
    const cached = await this.readCache(REDIS_KEY.projectToken(token));
    if (cached) { return cached; }

    // 2. Direct DB lookup
    const directResult = await this.lookupByToken(token);
    if (directResult) {
      this.writeCache(REDIS_KEY.projectToken(token), directResult);
      return directResult;
    }

    // 3. Hash fallback for legacy SDKs
    return this.resolveViaHashFallback(token);
  }

  private async resolveViaHashFallback(token: string): Promise<string> {
    this.logger.debug('Direct token lookup missed, trying sha256 hash fallback (legacy SDK support)');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const hashCacheKey = REDIS_KEY.projectToken(tokenHash);

    const cached = await this.readCache(hashCacheKey);
    if (cached) { return cached; }

    const result = await this.lookupByToken(tokenHash);
    if (result) {
      this.writeCache(hashCacheKey, result);
      return result;
    }

    this.logger.warn('Invalid project token');
    throw new UnauthorizedException('Invalid API key');
  }

  private async readCache(key: string): Promise<string | null> {
    try {
      const raw = await this.redis.get(key);
      if (raw) {
        const info: CachedProjectInfo = JSON.parse(raw);
        return info.project_id;
      }
    } catch (err) {
      this.logger.error({ err }, 'Redis error reading project token cache — falling back to DB');
    }
    return null;
  }

  private writeCache(key: string, projectId: string): void {
    const info: CachedProjectInfo = { project_id: projectId };
    this.redis.set(key, JSON.stringify(info), 'EX', API_KEY_CACHE_TTL_SECONDS)
      .catch((err: unknown) => this.logger.error({ err }, 'Failed to write project token cache'));
  }

  private async lookupByToken(token: string): Promise<string | null> {
    const result = await this.db
      .select({ project_id: projects.id })
      .from(projects)
      .where(eq(projects.token, token))
      .limit(1);
    return result.length > 0 ? result[0].project_id : null;
  }
}
