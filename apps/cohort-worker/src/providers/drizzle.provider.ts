import { Provider } from '@nestjs/common';
import { createDb, Database } from '@qurvo/db';

export const DRIZZLE = Symbol('DRIZZLE');

export const DrizzleProvider: Provider<Database> = {
  provide: DRIZZLE,
  useFactory: () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    return createDb(process.env.DATABASE_URL);
  },
};
