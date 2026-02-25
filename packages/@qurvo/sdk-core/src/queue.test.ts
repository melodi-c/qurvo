import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventQueue } from './queue';
import type { Transport, QueuePersistence } from './types';
import { QuotaExceededError, NonRetryableError } from './types';

function createMockTransport(sendFn?: Transport['send']): Transport {
  return { send: sendFn ?? vi.fn(async () => true) };
}

function createMockPersistence(): QueuePersistence & { store: unknown[] } {
  const store: unknown[] = [];
  return {
    store,
    save: vi.fn((events: unknown[]) => { store.length = 0; store.push(...events); }),
    load: vi.fn(() => [...store]),
  };
}

function createQueue(opts: {
  transport?: Transport;
  flushSize?: number;
  maxQueueSize?: number;
  persistence?: QueuePersistence;
} = {}) {
  return new EventQueue(
    opts.transport ?? createMockTransport(),
    'https://ingest.test/v1/batch',
    'test-key',
    60_000, // large flush interval — we flush manually in tests
    opts.flushSize ?? 100,
    opts.maxQueueSize ?? 1000,
    30_000,
    undefined,
    opts.persistence,
  );
}

describe('EventQueue', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('enqueues events and reports size', () => {
    const q = createQueue();
    q.enqueue({ id: 1 });
    q.enqueue({ id: 2 });
    expect(q.size).toBe(2);
  });

  it('flushes events via transport', async () => {
    const send = vi.fn(async () => true);
    const q = createQueue({ transport: createMockTransport(send) });
    q.enqueue({ id: 1 });
    q.enqueue({ id: 2 });

    await q.flush();

    expect(send).toHaveBeenCalledOnce();
    const payload = send.mock.calls[0][2] as any;
    expect(payload.events).toHaveLength(2);
    expect(q.size).toBe(0);
  });

  it('re-queues events on transport failure (returns false)', async () => {
    const send = vi.fn(async () => false);
    const q = createQueue({ transport: createMockTransport(send) });
    q.enqueue({ id: 1 });

    await q.flush();

    expect(q.size).toBe(1);
  });

  it('re-queues events on transport error (network)', async () => {
    const send = vi.fn(async () => { throw new Error('network'); });
    const q = createQueue({ transport: createMockTransport(send) });
    q.enqueue({ id: 1 });

    await q.flush();

    expect(q.size).toBe(1);
  });

  it('drops batch on NonRetryableError', async () => {
    const send = vi.fn(async () => { throw new NonRetryableError(400, 'bad'); });
    const q = createQueue({ transport: createMockTransport(send) });
    q.enqueue({ id: 1 });

    await q.flush();

    expect(q.size).toBe(0);
  });

  it('clears queue and stops on QuotaExceededError', async () => {
    const send = vi.fn(async () => { throw new QuotaExceededError(); });
    const q = createQueue({ transport: createMockTransport(send) });
    q.enqueue({ id: 1 });
    q.enqueue({ id: 2 });

    await q.flush();

    expect(q.size).toBe(0);
  });

  it('drops oldest event when maxQueueSize is reached', () => {
    const q = createQueue({ maxQueueSize: 3 });
    q.enqueue({ id: 1 });
    q.enqueue({ id: 2 });
    q.enqueue({ id: 3 });
    q.enqueue({ id: 4 });
    expect(q.size).toBe(3);
  });

  describe('flushForUnload — in-flight batch recovery', () => {
    it('includes in-flight batch in unload flush', async () => {
      let resolveSend: () => void;
      const sendPromise = new Promise<boolean>((r) => { resolveSend = () => r(true); });
      const sendCalls: unknown[][] = [];
      const send = vi.fn(async (...args: unknown[]) => {
        sendCalls.push(args);
        if (sendCalls.length === 1) return sendPromise; // first call blocks
        return true;
      });

      const q = createQueue({ transport: createMockTransport(send), flushSize: 2 });
      q.enqueue({ id: 1 });
      q.enqueue({ id: 2 });
      q.enqueue({ id: 3 }); // stays in queue

      // Start flush — takes [1, 2] as in-flight, [3] remains
      const flushPromise = q.flush();

      // Before flush completes, simulate page unload
      q.flushForUnload();

      // unload should send ALL events: in-flight [1,2] + queue [3]
      expect(sendCalls).toHaveLength(2);
      const unloadPayload = sendCalls[1][2] as any;
      expect(unloadPayload.events).toHaveLength(3);
      expect(unloadPayload.events.map((e: any) => e.id)).toEqual([1, 2, 3]);

      // Let the original flush complete
      resolveSend!();
      await flushPromise;
    });

    it('sends only queue events when no in-flight batch', () => {
      const send = vi.fn(async () => true);
      const q = createQueue({ transport: createMockTransport(send) });
      q.enqueue({ id: 1 });

      q.flushForUnload();

      expect(send).toHaveBeenCalledOnce();
      const payload = send.mock.calls[0][2] as any;
      expect(payload.events).toHaveLength(1);
      expect(q.size).toBe(0);
    });

    it('does nothing when queue and in-flight are empty', () => {
      const send = vi.fn(async () => true);
      const q = createQueue({ transport: createMockTransport(send) });

      q.flushForUnload();

      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('persistence', () => {
    it('saves queue to persistence on enqueue', () => {
      const persistence = createMockPersistence();
      const q = createQueue({ persistence });
      q.enqueue({ id: 1 });

      expect(persistence.save).toHaveBeenCalled();
      expect(persistence.store).toEqual([{ id: 1 }]);
    });

    it('restores events from persistence on construction', () => {
      const persistence = createMockPersistence();
      persistence.store.push({ id: 'old1' }, { id: 'old2' });

      const q = createQueue({ persistence });

      expect(q.size).toBe(2);
    });

    it('clears persistence after successful flush', async () => {
      const persistence = createMockPersistence();
      const q = createQueue({ persistence });
      q.enqueue({ id: 1 });

      await q.flush();

      expect(persistence.store).toEqual([]);
    });

    it('persists remaining events after partial flush', async () => {
      const persistence = createMockPersistence();
      const q = createQueue({ persistence, flushSize: 1 });
      q.enqueue({ id: 1 });
      q.enqueue({ id: 2 });

      await q.flush(); // sends first, keeps second

      expect(persistence.store).toEqual([{ id: 2 }]);
    });

    it('persists on flushForUnload (clears queue)', () => {
      const persistence = createMockPersistence();
      const q = createQueue({ persistence });
      q.enqueue({ id: 1 });

      q.flushForUnload();

      // queue should be empty after unload flush
      expect(persistence.store).toEqual([]);
    });

    it('handles persistence load failure gracefully', () => {
      const persistence: QueuePersistence = {
        save: vi.fn(),
        load: vi.fn(() => { throw new Error('corrupt'); }),
      };

      const q = createQueue({ persistence });
      expect(q.size).toBe(0);
    });
  });

  describe('size', () => {
    it('includes in-flight batch during flush', async () => {
      let resolveSend!: () => void;
      const send = vi.fn(() => new Promise<boolean>((r) => { resolveSend = () => r(true); }));
      const q = createQueue({ transport: createMockTransport(send) });

      q.enqueue({ id: 1 });
      q.enqueue({ id: 2 });
      expect(q.size).toBe(2);

      // Start flush manually — events move to inFlightBatch
      const flushPromise = q.flush();
      expect(q.size).toBe(2); // 2 in-flight, 0 in queue

      resolveSend();
      await flushPromise;

      expect(q.size).toBe(0); // all sent
    });
  });
});
