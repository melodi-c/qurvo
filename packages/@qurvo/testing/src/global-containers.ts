import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, type StartedTestContainer, Wait, getContainerRuntimeClient } from 'testcontainers';

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

/**
 * Returns true if ALL three containers are still in the Running state.
 * Used as a guard in startGlobalContainers() to detect when a container
 * has crashed after the initial startup (stale `started` singleton).
 */
async function allContainersRunning(s: StartedContainers): Promise<boolean> {
  try {
    const client = await getContainerRuntimeClient();
    const ids = [s.pgContainer.getId(), s.redisContainer.getId(), s.chContainer.getId()];
    const inspections = await Promise.all(
      ids.map((id) => client.container.inspect(client.container.getById(id))),
    );
    return inspections.every((info) => info.State.Running === true);
  } catch {
    // If inspection itself fails (e.g. Docker daemon unreachable), treat as not running.
    return false;
  }
}

export async function startGlobalContainers(): Promise<ContainerCoords> {
  if (started) {
    // Guard: if a container has crashed since the last successful start,
    // invalidate the singleton so we attempt a fresh start below.
    const healthy = await allContainersRunning(started);
    if (healthy) return started.coords;

    console.warn('[testing] startGlobalContainers: one or more containers are no longer running — invalidating singleton and restarting');
    started = null;
  }

  const results = await Promise.allSettled([
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

  const [pgResult, redisResult, chResult] = results;

  // If any container failed to start, stop all successfully started containers
  // before re-throwing to avoid resource leaks (important when Ryuk is disabled).
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length > 0) {
    const started_containers: StartedTestContainer[] = [];
    if (pgResult.status === 'fulfilled') started_containers.push(pgResult.value);
    if (redisResult.status === 'fulfilled') started_containers.push(redisResult.value);
    if (chResult.status === 'fulfilled') started_containers.push(chResult.value);

    await Promise.allSettled(started_containers.map((c) => c.stop()));

    const errors = failed.map((r) => (r as PromiseRejectedResult).reason);
    throw new AggregateError(errors, `Failed to start ${failed.length} container(s): ${errors.map(String).join('; ')}`);
  }

  const pgContainer = (pgResult as PromiseFulfilledResult<StartedPostgreSqlContainer>).value;
  const redisContainer = (redisResult as PromiseFulfilledResult<StartedTestContainer>).value;
  const chContainer = (chResult as PromiseFulfilledResult<StartedTestContainer>).value;

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

  // Reset started first so that a repeated call after a partial failure
  // does not attempt to stop already-stopped (or failed) containers again.
  started = null;

  const results = await Promise.allSettled([
    pgContainer.stop(),
    redisContainer.stop(),
    chContainer.stop(),
  ]);

  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => r.reason);

  if (errors.length > 0) {
    console.error('[testing] stopGlobalContainers: failed to stop some containers:', errors);
    throw new AggregateError(errors, `Failed to stop ${errors.length} container(s)`);
  }
}
