import { describe, it, expect } from 'vitest';
import { resolveTimestamp } from './ingest.service';

describe('resolveTimestamp', () => {
  const serverTime = '2026-01-15T12:00:00.000Z';

  it('returns serverTime when clientTs is undefined', () => {
    expect(resolveTimestamp(undefined, serverTime, '2026-01-15T11:59:55.000Z')).toBe(serverTime);
  });

  it('returns serverTime when sentAt is undefined', () => {
    expect(resolveTimestamp('2026-01-15T11:59:50.000Z', serverTime)).toBe(serverTime);
  });

  it('corrects clock drift using sentAt offset', () => {
    // Client created event 5s before sending (sentAt - clientTs = 5s)
    // Server should place event 5s before serverTime
    const clientTs = '2026-01-15T11:59:50.000Z'; // 10s before sentAt
    const sentAt = '2026-01-15T12:00:00.000Z';

    const result = resolveTimestamp(clientTs, serverTime, sentAt);
    // serverTime - 10s offset = 2026-01-15T11:59:50.000Z
    expect(result).toBe('2026-01-15T11:59:50.000Z');
  });

  it('handles client clock ahead of server (positive drift)', () => {
    // Client clock is 30s ahead: sentAt appears 30s in the future relative to server
    // But the offset (sentAt - clientTs) is still a valid positive number
    const clientTs = '2026-01-15T12:00:25.000Z'; // 5s before client's sentAt
    const sentAt = '2026-01-15T12:00:30.000Z';   // client clock 30s ahead

    const result = resolveTimestamp(clientTs, serverTime, sentAt);
    // offset = 5s, resolved = serverTime - 5s
    expect(result).toBe('2026-01-15T11:59:55.000Z');
  });

  it('handles client clock behind server (negative drift)', () => {
    // Client clock is 30s behind
    const clientTs = '2026-01-15T11:59:25.000Z'; // 5s before client's sentAt
    const sentAt = '2026-01-15T11:59:30.000Z';   // client clock 30s behind

    const result = resolveTimestamp(clientTs, serverTime, sentAt);
    // offset = 5s, resolved = serverTime - 5s
    expect(result).toBe('2026-01-15T11:59:55.000Z');
  });

  it('returns serverTime when clientTs is after sentAt (negative offset)', () => {
    const clientTs = '2026-01-15T12:00:10.000Z';
    const sentAt = '2026-01-15T12:00:00.000Z';

    expect(resolveTimestamp(clientTs, serverTime, sentAt)).toBe(serverTime);
  });

  it('returns serverTime when clientTs equals sentAt (zero offset)', () => {
    const clientTs = '2026-01-15T12:00:00.000Z';
    const sentAt = '2026-01-15T12:00:00.000Z';

    // offset = 0, resolved = serverTime - 0 = serverTime
    expect(resolveTimestamp(clientTs, serverTime, sentAt)).toBe(serverTime);
  });
});
