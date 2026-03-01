import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  dateOffset,
  msAgo,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { queryFunnel } from '../../analytics/funnel/funnel.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

// ── Nested JSON key (dot-notation) filter tests ───────────────────────────────
//
// Root cause: resolvePropertyExpr('properties.address.city') was producing
//   JSONExtractString(properties, 'address.city')
// which looks for a literal key "address.city" in ClickHouse, instead of
// navigating to the nested path {"address": {"city": "..."}}.
//
// After the fix: the key is split by '.' and the variadic form is used:
//   JSONExtractString(properties, 'address', 'city')
// which correctly traverses nested JSON objects.

describe('queryFunnel — nested JSON property filter (dot-notation)', () => {
  it('eq on address.city finds users with matching nested value', async () => {
    // personA: properties.address.city = 'Moscow' → should pass eq filter
    // personB: properties.address.city = 'London' → should NOT pass eq filter
    // personC: no address key at all → should NOT pass eq filter
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'user-a',
        event_name: 'signup',
        properties: JSON.stringify({ address: { city: 'Moscow' } }),
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'user-a',
        event_name: 'purchase',
        properties: JSON.stringify({ address: { city: 'Moscow' } }),
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'user-b',
        event_name: 'signup',
        properties: JSON.stringify({ address: { city: 'London' } }),
        timestamp: msAgo(3500),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'user-b',
        event_name: 'purchase',
        properties: JSON.stringify({ address: { city: 'London' } }),
        timestamp: msAgo(2500),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personC,
        distinct_id: 'user-c',
        event_name: 'signup',
        properties: JSON.stringify({ other: 'data' }),
        timestamp: msAgo(4000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personC,
        distinct_id: 'user-c',
        event_name: 'purchase',
        properties: JSON.stringify({ other: 'data' }),
        timestamp: msAgo(3000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        {
          event_name: 'signup',
          label: 'Signup',
          filters: [{ property: 'properties.address.city', operator: 'eq', value: 'Moscow' }],
        },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      timezone: 'UTC',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // Only personA (address.city = 'Moscow') should enter the funnel.
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
  });

  it('neq on address.city excludes users with matching value and absent key', async () => {
    // personA: address.city = 'Moscow' → should NOT pass neq 'London'
    // personB: address.city = 'London' → must NOT pass neq 'London' (exact match excluded)
    // personC: address.city = 'Berlin' → should pass neq 'London'
    // personD: no address key → must NOT pass neq 'London' (absent = excluded by JSONHas guard)
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();
    const personD = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'user-a',
        event_name: 'signup',
        properties: JSON.stringify({ address: { city: 'Moscow' } }),
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'user-a',
        event_name: 'purchase',
        properties: JSON.stringify({ address: { city: 'Moscow' } }),
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'user-b',
        event_name: 'signup',
        properties: JSON.stringify({ address: { city: 'London' } }),
        timestamp: msAgo(3500),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'user-b',
        event_name: 'purchase',
        properties: JSON.stringify({ address: { city: 'London' } }),
        timestamp: msAgo(2500),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personC,
        distinct_id: 'user-c',
        event_name: 'signup',
        properties: JSON.stringify({ address: { city: 'Berlin' } }),
        timestamp: msAgo(4000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personC,
        distinct_id: 'user-c',
        event_name: 'purchase',
        properties: JSON.stringify({ address: { city: 'Berlin' } }),
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personD,
        distinct_id: 'user-d',
        event_name: 'signup',
        properties: JSON.stringify({ other: 'no-address' }),
        timestamp: msAgo(4500),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personD,
        distinct_id: 'user-d',
        event_name: 'purchase',
        properties: JSON.stringify({ other: 'no-address' }),
        timestamp: msAgo(3500),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        {
          event_name: 'signup',
          label: 'Signup',
          filters: [{ property: 'properties.address.city', operator: 'neq', value: 'London' }],
        },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      timezone: 'UTC',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // personA (Moscow) and personC (Berlin) pass; personB (London) and personD (absent) are excluded.
    expect(r.steps[0].count).toBe(2);
    expect(r.steps[1].count).toBe(2);
  });

  it('is_set on nested path finds users with the nested key present', async () => {
    // personA: has address.city → should pass is_set
    // personB: has address but no city key → should NOT pass is_set on address.city
    // personC: no address key → should NOT pass is_set
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'user-a',
        event_name: 'signup',
        properties: JSON.stringify({ address: { city: 'Moscow' } }),
        timestamp: msAgo(3000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'user-a',
        event_name: 'purchase',
        properties: JSON.stringify({ address: { city: 'Moscow' } }),
        timestamp: msAgo(2000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'user-b',
        event_name: 'signup',
        properties: JSON.stringify({ address: { zip: '12345' } }),
        timestamp: msAgo(3500),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'user-b',
        event_name: 'purchase',
        properties: JSON.stringify({ address: { zip: '12345' } }),
        timestamp: msAgo(2500),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personC,
        distinct_id: 'user-c',
        event_name: 'signup',
        properties: JSON.stringify({ other: 'data' }),
        timestamp: msAgo(4000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personC,
        distinct_id: 'user-c',
        event_name: 'purchase',
        properties: JSON.stringify({ other: 'data' }),
        timestamp: msAgo(3000),
      }),
    ]);

    const result = await queryFunnel(ctx.ch, {
      project_id: projectId,
      steps: [
        {
          event_name: 'signup',
          label: 'Signup',
          filters: [{ property: 'properties.address.city', operator: 'is_set' }],
        },
        { event_name: 'purchase', label: 'Purchase' },
      ],
      conversion_window_days: 7,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
      timezone: 'UTC',
    });

    expect(result.breakdown).toBe(false);
    const r = result as Extract<typeof result, { breakdown: false }>;
    // Only personA has address.city present.
    expect(r.steps[0].count).toBe(1);
    expect(r.steps[1].count).toBe(1);
  });
});
