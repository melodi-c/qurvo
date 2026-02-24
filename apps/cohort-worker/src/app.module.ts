import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { CohortWorkerModule } from './cohort-worker/cohort-worker.module';

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
    CohortWorkerModule,
  ],
})
export class AppModule {}
