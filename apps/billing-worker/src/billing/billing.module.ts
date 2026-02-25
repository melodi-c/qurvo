import { Module } from '@nestjs/common';
import { RedisProvider, DrizzleProvider } from '@qurvo/nestjs-infra';
import { BillingCheckService } from './billing-check.service';
import { AiQuotaResetService } from './ai-quota-reset.service';
import { ShutdownService } from './shutdown.service';
import { MetricsService } from './metrics.service';

@Module({
  providers: [
    RedisProvider,
    DrizzleProvider,
    MetricsService,
    BillingCheckService,
    AiQuotaResetService,
    ShutdownService,
  ],
})
export class BillingModule {}
