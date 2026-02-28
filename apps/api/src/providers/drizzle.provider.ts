import type { Provider } from '@nestjs/common';
import type { Database } from '@qurvo/db';
import { createDb } from '@qurvo/db';

export const DRIZZLE = Symbol('DRIZZLE');

export const DrizzleProvider: Provider<Database> = {
  provide: DRIZZLE,
  useFactory: () => {
    if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required in production');
    }
    return createDb(process.env.DATABASE_URL);
  },
};
