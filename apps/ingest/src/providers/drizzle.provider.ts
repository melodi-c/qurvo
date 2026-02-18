import { Provider } from '@nestjs/common';
import { createDb, Database } from '@shot/db';

export const DRIZZLE = Symbol('DRIZZLE');

export const DrizzleProvider: Provider<Database> = {
  provide: DRIZZLE,
  useFactory: () => {
    return createDb(process.env.DATABASE_URL);
  },
};
