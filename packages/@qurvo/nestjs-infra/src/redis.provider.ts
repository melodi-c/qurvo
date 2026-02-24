import { Provider } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS = Symbol('REDIS');

export const RedisProvider: Provider<Redis> = {
  provide: REDIS,
  useFactory: () => {
    return new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  },
};
