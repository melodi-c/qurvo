import { CanActivate, ExecutionContext, Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS, BILLING_QUOTA_LIMITED_KEY } from '../constants';
import { MetricsService } from '../metrics.service';

@Injectable()
export class BillingGuard implements CanActivate {
  private readonly logger = new Logger(BillingGuard.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly metrics: MetricsService,
  ) {}

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
      this.metrics.quotaLimited.inc();
      request.quotaLimited = true;
    }

    return true;
  }
}
