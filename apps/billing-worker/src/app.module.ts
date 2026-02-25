import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { BillingModule } from './billing/billing.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty' }
          : undefined,
      },
    }),
    BillingModule,
  ],
})
export class AppModule {}
