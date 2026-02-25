import { Provider } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS = Symbol('REDIS');

export const RedisProvider: Provider<Redis> = {
  provide: REDIS,
  useFactory: () => {
    if (process.env.NODE_ENV === 'production' && !process.env.REDIS_URL) {
      throw new Error('REDIS_URL environment variable is required in production');
    }
    return new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  },
};
