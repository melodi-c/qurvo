export async function teardown() {
  const { teardownContainers } = await import('@shot/testing');
  await teardownContainers();
}
