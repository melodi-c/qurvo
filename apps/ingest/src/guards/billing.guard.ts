import { CanActivate, ExecutionContext, Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS, BILLING_QUOTA_LIMITED_KEY } from '../constants';

@Injectable()
export class BillingGuard implements CanActivate {
  private readonly logger = new Logger(BillingGuard.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<import('fastify').FastifyRequest>();
    const projectId = request.projectId;

    let isMember: number;
    try {
      isMember = await this.redis.sismember(BILLING_QUOTA_LIMITED_KEY, projectId);
    } catch (err) {
      this.logger.error({ err, projectId }, 'Redis error in billing check — failing open');
      return true;
    }

    if (isMember) {
      this.logger.warn({ projectId }, 'Event limit exceeded');
      request.quotaLimited = true;
    }

    return true;
  }
}
