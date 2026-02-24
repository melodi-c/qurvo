import { CanActivate, ExecutionContext, Injectable, Inject, HttpException, HttpStatus, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS, billingCounterKey } from '../constants';

@Injectable()
export class BillingGuard implements CanActivate {
  private readonly logger = new Logger(BillingGuard.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<import('fastify').FastifyRequest>();
    const eventsLimit = request.eventsLimit;

    if (eventsLimit === null) return true;

    const projectId = request.projectId;
    const counterKey = billingCounterKey(projectId);
    const current = await this.redis.get(counterKey);
    const count = current !== null ? parseInt(current, 10) : 0;

    if (!Number.isNaN(count) && count >= eventsLimit) {
      this.logger.warn({ projectId, count, limit: eventsLimit }, 'Event limit exceeded');
      throw new HttpException('Monthly event limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }
}
