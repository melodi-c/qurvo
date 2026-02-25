import './tracer';
import 'dotenv/config';
import 'reflect-metadata';
import { bootstrapWorker } from '@qurvo/worker-core';
import { AppModule } from './app.module';

bootstrapWorker({ module: AppModule }).catch((err) => {
  console.error('Fatal error', err);
  process.exit(1);
});
