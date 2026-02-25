import { Module } from '@nestjs/common';
import { RedisProvider, DrizzleProvider } from '@qurvo/nestjs-infra';
import { BillingCheckService } from './billing-check.service';
import { ShutdownService } from './shutdown.service';

@Module({
  providers: [
    RedisProvider,
    DrizzleProvider,
    BillingCheckService,
    ShutdownService,
  ],
})
export class BillingModule {}
