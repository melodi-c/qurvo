import { CanActivate, ExecutionContext, Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { eq } from 'drizzle-orm';
import { projects, plans } from '@qurvo/db';
import type { Database } from '@qurvo/db';
import { REDIS } from '../../providers/redis.provider';
import { DRIZZLE } from '../../providers/drizzle.provider';
import { AiQuotaExceededException } from '../exceptions/ai-quota-exceeded.exception';
import { aiQuotaCounterKey } from '../../utils/ai-quota-key';

export { aiQuotaCounterKey } from '../../utils/ai-quota-key';

// TTL slightly longer than the billing period to avoid premature expiry
const QUOTA_KEY_TTL_SECONDS = 35 * 24 * 60 * 60; // 35 days

@Injectable()
export class AiQuotaGuard implements CanActivate {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: string = request.user?.user_id;
    const projectId: string = request.body?.project_id;

    if (!userId || !projectId) return true;

    // Look up the plan's AI message limit for this project
    const rows = await this.db
      .select({ ai_messages_per_month: plans.ai_messages_per_month })
      .from(projects)
      .leftJoin(plans, eq(projects.plan_id, plans.id))
      .where(eq(projects.id, projectId))
      .limit(1);

    const limit = rows[0]?.ai_messages_per_month ?? null;

    // -1 or null = unlimited
    if (limit === null || limit < 0) return true;

    const key = aiQuotaCounterKey(userId);

    // Atomically increment and check in one pipeline
    const [count] = await this.redis
      .pipeline()
      .incr(key)
      .expire(key, QUOTA_KEY_TTL_SECONDS)
      .exec()
      .then((results) => {
        if (!results) return [0];
        return [(results[0][1] as number) ?? 0];
      });

    if (count > limit) {
      // Decrement back so the counter reflects actual usage, not over-counted attempts
      await this.redis.decr(key);
      throw new AiQuotaExceededException(
        `AI message quota exceeded: ${limit} messages per month. Upgrade your plan to continue.`,
      );
    }

    return true;
  }
}
