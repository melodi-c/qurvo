import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import Redis from 'ioredis';
import { projects, plans } from '@qurvo/db';
import type { Database } from '@qurvo/db';
import { DRIZZLE } from '../providers/drizzle.provider';
import { REDIS } from '../providers/redis.provider';
import { aiQuotaCounterKey } from '../utils/ai-quota-key';

// Intentionally duplicated from apps/ingest/src/constants.ts.
// Both apps read from the same Redis keys; keeping the constant local
// avoids a cross-app dependency for a single string.
const BILLING_EVENTS_KEY_PREFIX = 'billing:events';

@Injectable()
export class BillingService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async getStatus(projectId: string, userId?: string) {
    const result = await this.db
      .select({
        plan_slug: plans.slug,
        plan_name: plans.name,
        events_limit: plans.events_limit,
        data_retention_days: plans.data_retention_days,
        max_projects: plans.max_projects,
        ai_messages_per_month: plans.ai_messages_per_month,
        features: plans.features,
      })
      .from(projects)
      .leftJoin(plans, eq(projects.plan_id, plans.id))
      .where(eq(projects.id, projectId))
      .limit(1);

    const plan = result[0] ?? {
      plan_slug: 'free',
      plan_name: 'Free',
      events_limit: null,
      data_retention_days: null,
      max_projects: null,
      ai_messages_per_month: null,
      features: { cohorts: true, lifecycle: true, stickiness: true, api_export: true, ai_insights: true },
    };

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;

    const counterKey = `${BILLING_EVENTS_KEY_PREFIX}:${projectId}:${monthStr}`;

    let ai_messages_used = 0;
    let rawEvents: string | null;

    if (userId) {
      const aiQuotaKey = aiQuotaCounterKey(userId, now);
      const [rawEventsResult, rawAiResult] = await this.redis.mget(counterKey, aiQuotaKey);
      rawEvents = rawEventsResult;
      ai_messages_used = rawAiResult ? parseInt(rawAiResult, 10) : 0;
    } else {
      rawEvents = await this.redis.get(counterKey);
    }

    const events_this_month = rawEvents ? parseInt(rawEvents, 10) : 0;

    const period_start = new Date(Date.UTC(year, month, 1)).toISOString();
    const period_end = new Date(Date.UTC(year, month + 1, 1)).toISOString();

    return {
      plan: plan.plan_slug,
      plan_name: plan.plan_name,
      events_this_month,
      events_limit: plan.events_limit ?? null,
      data_retention_days: plan.data_retention_days ?? null,
      max_projects: plan.max_projects ?? null,
      ai_messages_per_month: plan.ai_messages_per_month ?? null,
      ai_messages_used,
      features: plan.features,
      period_start,
      period_end,
    };
  }
}
