import { teardownContainers } from '@qurvo/testing';

export async function teardown() {
  await teardownContainers();
}
