import { afterAll } from 'vitest';
import { teardownContainers } from '@qurvo/testing';

afterAll(async () => {
  await teardownContainers();
});
