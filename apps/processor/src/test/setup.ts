export async function teardown() {
  // closeTestContext runs in the worker process (singleFork),
  // but globalSetup teardown runs in the main process — so we only
  // tear down the containers here.
  const { teardownContainers } = await import('@qurvo/testing');
  await teardownContainers();
}
