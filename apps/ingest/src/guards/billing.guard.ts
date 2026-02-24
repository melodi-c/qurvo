import { CanActivate, ExecutionContext, Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS, billingCounterKey } from '../constants';

@Injectable()
export class BillingGuard implements CanActivate {
  private readonly logger = new Logger(BillingGuard.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<import('fastify').FastifyRequest>();
    const eventsLimit = request.eventsLimit;

    if (eventsLimit == null) return true;

    const projectId = request.projectId;
    const counterKey = billingCounterKey(projectId);

    let current: string | null;
    try {
      current = await this.redis.get(counterKey);
    } catch (err) {
      this.logger.error({ err, projectId }, 'Redis error in billing check — failing open');
      return true;
    }

    const count = current !== null ? parseInt(current, 10) : 0;

    if (!Number.isNaN(count) && count >= eventsLimit) {
      this.logger.warn({ projectId, count, limit: eventsLimit }, 'Event limit exceeded');
      // Return 200 instead of 429 to prevent SDK retries (PostHog pattern).
      // The controller checks request.quotaLimited and returns early.
      request.quotaLimited = true;
    }

    return true;
  }
}
