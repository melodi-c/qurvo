import { describe, it, expect, beforeAll } from 'vitest';
import type { ContainerContext } from '@qurvo/testing';
import { randomUUID } from 'crypto';
import { getTestContext } from '../context';
import { DistributedLock } from '@qurvo/distributed-lock';

let ctx: ContainerContext;

beforeAll(async () => {
  const tc = await getTestContext();
  ctx = tc.ctx;
}, 120_000);

function makeLock(key?: string, instanceId?: string, ttl = 30) {
  return new DistributedLock(
    ctx.redis,
    key ?? `lock:test:${randomUUID()}`,
    instanceId ?? randomUUID(),
    ttl,
  );
}

describe('DistributedLock', () => {
  it('acquire succeeds on fresh key', async () => {
    const lock = makeLock();
    expect(await lock.acquire()).toBe(true);
  });

  it('second acquire on same key fails', async () => {
    const key = `lock:test:${randomUUID()}`;
    const lock = makeLock(key);

    expect(await lock.acquire()).toBe(true);
    expect(await lock.acquire()).toBe(false);
  });

  it('different instance cannot acquire held lock', async () => {
    const key = `lock:test:${randomUUID()}`;
    const lock1 = makeLock(key, 'instance-1');
    const lock2 = makeLock(key, 'instance-2');

    expect(await lock1.acquire()).toBe(true);
    expect(await lock2.acquire()).toBe(false);
  });

  it('release then acquire succeeds', async () => {
    const key = `lock:test:${randomUUID()}`;
    const lock = makeLock(key);

    expect(await lock.acquire()).toBe(true);
    await lock.release();
    expect(await lock.acquire()).toBe(true);
  });

  it('release by different instanceId is a no-op — lock stays held', async () => {
    const key = `lock:test:${randomUUID()}`;
    const owner = makeLock(key, 'owner');
    const impostor = makeLock(key, 'impostor');

    expect(await owner.acquire()).toBe(true);

    // Impostor tries to release — Lua guard prevents it
    await impostor.release();

    // Lock should still be held by owner
    const thirdParty = makeLock(key, 'third-party');
    expect(await thirdParty.acquire()).toBe(false);
  });

  it('lock auto-releases after TTL expires', async () => {
    const key = `lock:test:${randomUUID()}`;
    const lock1 = makeLock(key, 'instance-1', 1); // 1-second TTL

    expect(await lock1.acquire()).toBe(true);

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 1500));

    const lock2 = makeLock(key, 'instance-2');
    expect(await lock2.acquire()).toBe(true);
  });

  it('release is idempotent — double release does not throw', async () => {
    const lock = makeLock();
    await lock.acquire();
    await lock.release();
    await lock.release(); // should not throw
  });
});
