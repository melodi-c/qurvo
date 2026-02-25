import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Redis from 'ioredis';
import type { Database } from '@qurvo/db';
import { REDIS, DRIZZLE } from '@qurvo/nestjs-infra';
import { BillingCheckService } from './billing-check.service';

@Injectable()
export class ShutdownService implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectPinoLogger(ShutdownService.name) private readonly logger: PinoLogger,
    private readonly billingCheckService: BillingCheckService,
  ) {}

  async onApplicationShutdown() {
    await this.billingCheckService
      .stop()
      .catch((err) => this.logger.warn({ err }, 'BillingCheckService stop failed'));
    await this.db.$pool.end().catch((err) =>
      this.logger.warn({ err }, 'PostgreSQL pool close failed'),
    );
    await this.redis.quit().catch((err) =>
      this.logger.warn({ err }, 'Redis quit failed'),
    );
  }
}
