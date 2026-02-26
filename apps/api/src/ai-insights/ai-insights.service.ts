import { Inject, Injectable } from '@nestjs/common';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { aiInsights } from '@qurvo/db';
import type { Database } from '@qurvo/db';
import { DRIZZLE } from '../providers/drizzle.provider';

@Injectable()
export class AiInsightsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async listInsights(projectId: string) {
    return this.db
      .select()
      .from(aiInsights)
      .where(and(eq(aiInsights.project_id, projectId), isNull(aiInsights.dismissed_at)))
      .orderBy(desc(aiInsights.created_at))
      .limit(50);
  }

  async dismissInsight(projectId: string, insightId: string): Promise<boolean> {
    const result = await this.db
      .update(aiInsights)
      .set({ dismissed_at: new Date() })
      .where(
        and(
          eq(aiInsights.id, insightId),
          eq(aiInsights.project_id, projectId),
          isNull(aiInsights.dismissed_at),
        ),
      )
      .returning({ id: aiInsights.id });

    return result.length > 0;
  }
}
