import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

const PG_USER = 'qurvo';
const PG_PASSWORD = 'qurvo_secret';
const CH_USER = 'qurvo';
const CH_PASSWORD = 'qurvo_secret';

export interface ContainerCoords {
  pgHost: string;
  pgPort: number;
  pgUser: string;
  pgPassword: string;

  redisHost: string;
  redisPort: number;

  chHost: string;
  chPort: number;
  chUser: string;
  chPassword: string;
}

interface StartedContainers {
  coords: ContainerCoords;
  pgContainer: StartedPostgreSqlContainer;
  redisContainer: StartedTestContainer;
  chContainer: StartedTestContainer;
}

let started: StartedContainers | null = null;

export async function startGlobalContainers(): Promise<ContainerCoords> {
  if (started) return started.coords;

  const [pgContainer, redisContainer, chContainer] = await Promise.all([
    new PostgreSqlContainer('postgres:17-alpine')
      .withDatabase('postgres')
      .withUsername(PG_USER)
      .withPassword(PG_PASSWORD)
      .start(),

    new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
      .start(),

    new GenericContainer('clickhouse/clickhouse-server:24.8')
      .withEnvironment({
        CLICKHOUSE_USER: CH_USER,
        CLICKHOUSE_PASSWORD: CH_PASSWORD,
        CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: '1',
      })
      .withExposedPorts(8123)
      .withWaitStrategy(Wait.forHttp('/ping', 8123).forStatusCode(200))
      .start(),
  ]);

  const coords: ContainerCoords = {
    pgHost: pgContainer.getHost(),
    pgPort: pgContainer.getMappedPort(5432),
    pgUser: PG_USER,
    pgPassword: PG_PASSWORD,

    redisHost: redisContainer.getHost(),
    redisPort: redisContainer.getMappedPort(6379),

    chHost: chContainer.getHost(),
    chPort: chContainer.getMappedPort(8123),
    chUser: CH_USER,
    chPassword: CH_PASSWORD,
  };

  started = { coords, pgContainer, redisContainer, chContainer };
  return coords;
}

export async function stopGlobalContainers(): Promise<void> {
  if (!started) return;
  const { pgContainer, redisContainer, chContainer } = started;
  await Promise.all([
    pgContainer.stop(),
    redisContainer.stop(),
    chContainer.stop(),
  ]);
  started = null;
}
