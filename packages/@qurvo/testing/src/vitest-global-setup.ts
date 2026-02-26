import { startGlobalContainers, stopGlobalContainers } from './global-containers';

export function createGlobalSetup() {
  return {
    async setup() {
      const coords = await startGlobalContainers();

      process.env.TEST_PG_HOST = coords.pgHost;
      process.env.TEST_PG_PORT = String(coords.pgPort);
      process.env.TEST_PG_USER = coords.pgUser;
      process.env.TEST_PG_PASSWORD = coords.pgPassword;

      process.env.TEST_REDIS_HOST = coords.redisHost;
      process.env.TEST_REDIS_PORT = String(coords.redisPort);

      process.env.TEST_CH_HOST = coords.chHost;
      process.env.TEST_CH_PORT = String(coords.chPort);
      process.env.TEST_CH_USER = coords.chUser;
      process.env.TEST_CH_PASSWORD = coords.chPassword;

      const shutdown = async () => {
        await stopGlobalContainers();
        process.exit(0);
      };
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
    },

    async teardown() {
      await stopGlobalContainers();
    },
  };
}
