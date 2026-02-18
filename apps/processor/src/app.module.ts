import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ProcessorModule } from './processor/processor.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty' }
          : undefined,
      } as any,
    }),
    ProcessorModule,
  ],
})
export class AppModule {}
