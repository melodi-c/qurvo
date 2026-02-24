import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and, isNull } from 'drizzle-orm';
import * as crypto from 'crypto';
import { apiKeys } from '@qurvo/db';
import { DRIZZLE } from '../providers/drizzle.provider';
import type { Database } from '@qurvo/db';
import { hashToken } from '../utils/hash';
import { ApiKeyNotFoundException } from './exceptions/api-key-not-found.exception';

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async list(projectId: string) {
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

  async create(projectId: string, input: { name: string; scopes?: string[]; expires_at?: string }) {
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

  async revoke(projectId: string, keyId: string) {
    const [revoked] = await this.db
      .update(apiKeys)
      .set({ revoked_at: new Date() })
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.project_id, projectId), isNull(apiKeys.revoked_at)))
      .returning({ id: apiKeys.id });

    if (!revoked) throw new ApiKeyNotFoundException();

    this.logger.log({ apiKeyId: keyId, projectId }, 'API key revoked');
  }
}
