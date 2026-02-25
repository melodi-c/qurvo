import { LoggerModule } from 'nestjs-pino';

export function workerLoggerModule() {
  return LoggerModule.forRoot({
    pinoHttp: {
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty' }
        : undefined,
    } as any,
  });
}
