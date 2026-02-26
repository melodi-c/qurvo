import { afterAll } from 'vitest';
import { closeTestContext } from './context';

afterAll(async () => {
  await closeTestContext();
});
