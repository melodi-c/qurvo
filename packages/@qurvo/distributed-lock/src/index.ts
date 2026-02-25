import Redis from 'ioredis';

const RELEASE_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  else
    return 0
  end
`;

const EXTEND_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('expire', KEYS[1], ARGV[2])
  else
    return 0
  end
`;

export class DistributedLock {
  constructor(
    private readonly redis: Redis,
    private readonly key: string,
    private readonly instanceId: string,
    private readonly ttlSeconds: number,
  ) {}

  async acquire(): Promise<boolean> {
    const result = await this.redis.set(
      this.key,
      this.instanceId,
      'EX',
      this.ttlSeconds,
      'NX',
    );
    return result !== null;
  }

  async extend(ttlSeconds?: number): Promise<boolean> {
    const result = await this.redis.eval(
      EXTEND_SCRIPT, 1, this.key, this.instanceId, ttlSeconds ?? this.ttlSeconds,
    );
    return result === 1;
  }

  async release(): Promise<void> {
    await this.redis.eval(RELEASE_SCRIPT, 1, this.key, this.instanceId);
  }
}
