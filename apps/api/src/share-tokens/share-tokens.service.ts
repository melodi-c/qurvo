import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import * as crypto from 'crypto';
import { shareTokens, type ShareTokenResourceType } from '@qurvo/db';
import { DRIZZLE } from '../providers/drizzle.provider';
import type { Database } from '@qurvo/db';
import { ShareTokenNotFoundException } from './exceptions/share-token-not-found.exception';

@Injectable()
export class ShareTokensService {
  private readonly logger = new Logger(ShareTokensService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async create(
    projectId: string,
    userId: string,
    resourceType: ShareTokenResourceType,
    resourceId: string,
    expiresAt?: Date,
  ) {
    const token = crypto.randomBytes(32).toString('hex');

    const [shareToken] = await this.db
      .insert(shareTokens)
      .values({
        token,
        resource_type: resourceType,
        resource_id: resourceId,
        project_id: projectId,
        created_by: userId,
        expires_at: expiresAt ?? null,
      })
      .returning();

    this.logger.log({ shareTokenId: shareToken.id, projectId, resourceType, resourceId }, 'Share token created');
    return shareToken;
  }

  async findByToken(token: string) {
    const [shareToken] = await this.db
      .select()
      .from(shareTokens)
      .where(eq(shareTokens.token, token))
      .limit(1);

    if (!shareToken) {return null;}
    if (shareToken.expires_at && shareToken.expires_at < new Date()) {return null;}

    return shareToken;
  }

  async findDashboardToken(token: string) {
    const shareToken = await this.findByToken(token);
    if (shareToken?.resource_type !== 'dashboard') {
      throw new ShareTokenNotFoundException();
    }
    return shareToken;
  }

  async findInsightToken(token: string) {
    const shareToken = await this.findByToken(token);
    if (shareToken?.resource_type !== 'insight') {
      throw new ShareTokenNotFoundException();
    }
    return shareToken;
  }

  async listByResource(projectId: string, resourceType: ShareTokenResourceType, resourceId: string) {
    return this.db
      .select()
      .from(shareTokens)
      .where(
        and(
          eq(shareTokens.project_id, projectId),
          eq(shareTokens.resource_type, resourceType),
          eq(shareTokens.resource_id, resourceId),
        ),
      )
      .orderBy(shareTokens.created_at);
  }

  async revoke(projectId: string, id: string): Promise<void> {
    const [deleted] = await this.db
      .delete(shareTokens)
      .where(and(eq(shareTokens.id, id), eq(shareTokens.project_id, projectId)))
      .returning({ id: shareTokens.id });

    if (!deleted) {throw new ShareTokenNotFoundException('Share token not found');}
    this.logger.log({ shareTokenId: id, projectId }, 'Share token revoked');
  }
}
