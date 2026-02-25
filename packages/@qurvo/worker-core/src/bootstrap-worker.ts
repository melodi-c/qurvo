import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

export interface BootstrapWorkerOptions {
  module: any;
  requiredEnv?: readonly string[];
}

export async function bootstrapWorker(options: BootstrapWorkerOptions): Promise<void> {
  if (options.requiredEnv) {
    const missing = options.requiredEnv.filter((k) => !process.env[k]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }
  const app = await NestFactory.createApplicationContext(options.module, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
}
