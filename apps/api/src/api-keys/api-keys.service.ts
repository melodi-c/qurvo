import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and, isNull } from 'drizzle-orm';
import * as crypto from 'crypto';
import { apiKeys } from '@qurvo/db';
import { DRIZZLE } from '../providers/drizzle.provider';
import type { Database } from '@qurvo/db';
import { hashToken } from '../utils/hash';
import { ProjectsService } from '../projects/projects.service';
import { ApiKeyNotFoundException } from './exceptions/api-key-not-found.exception';
import { ApiKeyPermissionException } from './exceptions/insufficient-permissions.exception';

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly projectsService: ProjectsService,
  ) {}

  async list(projectId: string, userId: string) {
    await this.projectsService.getMembership(userId, projectId);
    return this.db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        key_prefix: apiKeys.key_prefix,
        scopes: apiKeys.scopes,
        last_used_at: apiKeys.last_used_at,
        expires_at: apiKeys.expires_at,
        revoked_at: apiKeys.revoked_at,
        created_at: apiKeys.created_at,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.project_id, projectId), isNull(apiKeys.revoked_at)));
  }

  async create(projectId: string, userId: string, input: { name: string; scopes?: string[]; expires_at?: string }) {
    const membership = await this.projectsService.getMembership(userId, projectId);
    if (membership.role === 'viewer') throw new ApiKeyPermissionException();

    const rawKey = crypto.randomBytes(24).toString('base64url');
    const key_prefix = rawKey.slice(0, 16);
    const key_hash = hashToken(rawKey);

    const [apiKey] = await this.db.insert(apiKeys).values({
      project_id: projectId,
      name: input.name,
      key_prefix,
      key_hash,
      scopes: input.scopes || [],
      expires_at: input.expires_at ? new Date(input.expires_at) : null,
    }).returning();

    this.logger.log({ apiKeyId: apiKey.id, projectId }, 'API key created');

    return {
      id: apiKey.id,
      name: apiKey.name,
      key: rawKey,
      key_prefix,
      created_at: apiKey.created_at,
    };
  }

  async revoke(keyId: string, projectId: string, userId: string) {
    const membership = await this.projectsService.getMembership(userId, projectId);
    if (membership.role === 'viewer') throw new ApiKeyPermissionException();

    const result = await this.db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.project_id, projectId), isNull(apiKeys.revoked_at)))
      .limit(1);

    if (result.length === 0) throw new ApiKeyNotFoundException();

    await this.db
      .update(apiKeys)
      .set({ revoked_at: new Date() })
      .where(eq(apiKeys.id, keyId));

    this.logger.log({ apiKeyId: keyId, projectId }, 'API key revoked');

    return { ok: true };
  }
}
