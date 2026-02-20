export async function teardown() {
  const { teardownContainers } = await import('@qurvo/testing');
  await teardownContainers();
}
