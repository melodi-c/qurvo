import type { LifecycleResult } from '@/api/generated/Api';

/**
 * Daily lifecycle data — 7 days with realistic new/returning/resurrecting/dormant split.
 * Buckets use fixed ISO timestamps so stories are deterministic.
 */
export const LIFECYCLE_BASE: LifecycleResult = {
  granularity: 'day',
  totals: { new: 420, returning: 310, resurrecting: 95, dormant: -185 },
  data: [
    {
      bucket: '2025-02-01T00:00:00.000Z',
      new: 42,
      returning: 38,
      resurrecting: 8,
      dormant: -12,
    },
    {
      bucket: '2025-02-02T00:00:00.000Z',
      new: 55,
      returning: 41,
      resurrecting: 10,
      dormant: -18,
    },
    {
      bucket: '2025-02-03T00:00:00.000Z',
      new: 38,
      returning: 29,
      resurrecting: 6,
      dormant: -22,
    },
    {
      bucket: '2025-02-04T00:00:00.000Z',
      new: 61,
      returning: 47,
      resurrecting: 14,
      dormant: -9,
    },
    {
      bucket: '2025-02-05T00:00:00.000Z',
      new: 49,
      returning: 35,
      resurrecting: 11,
      dormant: -31,
    },
    {
      bucket: '2025-02-06T00:00:00.000Z',
      new: 72,
      returning: 58,
      resurrecting: 18,
      dormant: -15,
    },
    {
      bucket: '2025-02-07T00:00:00.000Z',
      new: 103,
      returning: 62,
      resurrecting: 28,
      dormant: -78,
    },
  ],
};

/**
 * Weekly lifecycle data — 4 weeks with higher absolute numbers.
 * Suitable for granularity toggle stories.
 */
export const LIFECYCLE_WEEKLY: LifecycleResult = {
  granularity: 'week',
  totals: { new: 540, returning: 420, resurrecting: 110, dormant: -230 },
  data: [
    {
      bucket: '2025-01-06T00:00:00.000Z',
      new: 120,
      returning: 95,
      resurrecting: 22,
      dormant: -48,
    },
    {
      bucket: '2025-01-13T00:00:00.000Z',
      new: 98,
      returning: 81,
      resurrecting: 19,
      dormant: -63,
    },
    {
      bucket: '2025-01-20T00:00:00.000Z',
      new: 145,
      returning: 112,
      resurrecting: 31,
      dormant: -55,
    },
    {
      bucket: '2025-01-27T00:00:00.000Z',
      new: 177,
      returning: 132,
      resurrecting: 38,
      dormant: -64,
    },
  ],
};

/**
 * Daily lifecycle data with prominent values in all four states.
 * Useful when verifying that all segments are visually distinct.
 */
export const LIFECYCLE_ALL_STATES: LifecycleResult = {
  granularity: 'day',
  totals: { new: 380, returning: 290, resurrecting: 110, dormant: -200 },
  data: [
    {
      bucket: '2025-02-01T00:00:00.000Z',
      new: 85,
      returning: 62,
      resurrecting: 28,
      dormant: -45,
    },
    {
      bucket: '2025-02-02T00:00:00.000Z',
      new: 52,
      returning: 49,
      resurrecting: 21,
      dormant: -38,
    },
    {
      bucket: '2025-02-03T00:00:00.000Z',
      new: 71,
      returning: 55,
      resurrecting: 18,
      dormant: -52,
    },
    {
      bucket: '2025-02-04T00:00:00.000Z',
      new: 40,
      returning: 38,
      resurrecting: 15,
      dormant: -29,
    },
    {
      bucket: '2025-02-05T00:00:00.000Z',
      new: 132,
      returning: 86,
      resurrecting: 28,
      dormant: -36,
    },
  ],
};
