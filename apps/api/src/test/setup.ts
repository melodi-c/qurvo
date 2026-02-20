import { teardownContainers } from '@shot/testing';

export async function teardown() {
  await teardownContainers();
}
