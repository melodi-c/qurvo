import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Redis from 'ioredis';
import type { Database } from '@qurvo/db';
import { REDIS, DRIZZLE } from '@qurvo/nestjs-infra';
import { shutdownDb, shutdownRedis } from '@qurvo/worker-core';
import { BillingCheckService } from './billing-check.service';
import { AiQuotaResetService } from './ai-quota-reset.service';

@Injectable()
export class ShutdownService implements OnApplicationShutdown {
  // eslint-disable-next-line max-params -- NestJS DI requires separate constructor params
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectPinoLogger(ShutdownService.name) private readonly logger: PinoLogger,
    private readonly billingCheckService: BillingCheckService,
    private readonly aiQuotaResetService: AiQuotaResetService,
  ) {}

  async onApplicationShutdown() {
    await this.billingCheckService
      .stop()
      .catch((err) => this.logger.warn({ err }, 'BillingCheckService stop failed'));
    await this.aiQuotaResetService
      .stop()
      .catch((err) => this.logger.warn({ err }, 'AiQuotaResetService stop failed'));
    await shutdownDb(this.db, this.logger);
    await shutdownRedis(this.redis, this.logger);
  }
}
