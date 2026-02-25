import { Module } from '@nestjs/common';
import { workerLoggerModule } from '@qurvo/worker-core';
import { BillingModule } from './billing/billing.module';

@Module({
  imports: [workerLoggerModule(), BillingModule],
})
export class AppModule {}
