import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  setupContainers,
  insertTestEvents,
  buildEvent,
  daysAgo,
  ts,
  type ContainerContext,
} from '@qurvo/testing';
import {
  queryDevices,
  queryGeography,
} from '../../web-analytics/web-analytics.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await setupContainers();
}, 120_000);

// ── queryDevices ───────────────────────────────────────────────────────────────

describe('queryDevices', () => {
  it('returns device types, browsers, and OSes sorted by visitors descending', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'ua',
        event_name: '$pageview',
        device_type: 'Desktop',
        browser: 'Chrome',
        os: 'Windows',
        timestamp: ts(3, 10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'ub',
        event_name: '$pageview',
        device_type: 'Desktop',
        browser: 'Chrome',
        os: 'macOS',
        timestamp: ts(3, 11),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personC,
        distinct_id: 'uc',
        event_name: '$pageview',
        device_type: 'Mobile',
        browser: 'Safari',
        os: 'iOS',
        timestamp: ts(3, 12),
      }),
    ]);

    const result = await queryDevices(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(4),
      date_to: daysAgo(2),
    });

    // Desktop should be first (2 visitors)
    expect(result.device_types[0].name).toBe('Desktop');
    expect(result.device_types[0].visitors).toBe(2);
    const mobile = result.device_types.find((d) => d.name === 'Mobile');
    expect(mobile).toBeDefined();
    expect(mobile!.visitors).toBe(1);

    // Chrome should be first (2 visitors)
    expect(result.browsers[0].name).toBe('Chrome');
    expect(result.browsers[0].visitors).toBe(2);

    // OSes should include Windows, macOS, iOS
    const osNames = result.oses.map((o) => o.name);
    expect(osNames).toContain('Windows');
    expect(osNames).toContain('macOS');
    expect(osNames).toContain('iOS');
  });

  it('returns empty results when no pageview events exist', async () => {
    const projectId = randomUUID();

    const result = await queryDevices(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(5),
      date_to: daysAgo(3),
    });

    expect(result.device_types).toHaveLength(0);
    expect(result.browsers).toHaveLength(0);
    expect(result.oses).toHaveLength(0);
  });
});

// ── queryGeography ─────────────────────────────────────────────────────────────

describe('queryGeography', () => {
  it('returns countries, regions, and cities sorted by visitors descending', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'ua',
        event_name: '$pageview',
        country: 'US',
        region: 'California',
        city: 'San Francisco',
        timestamp: ts(3, 10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'ub',
        event_name: '$pageview',
        country: 'US',
        region: 'New York',
        city: 'New York City',
        timestamp: ts(3, 11),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personC,
        distinct_id: 'uc',
        event_name: '$pageview',
        country: 'DE',
        region: 'Bavaria',
        city: 'Munich',
        timestamp: ts(3, 12),
      }),
    ]);

    const result = await queryGeography(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(4),
      date_to: daysAgo(2),
    });

    // US should be first (2 visitors)
    expect(result.countries[0].name).toBe('US');
    expect(result.countries[0].visitors).toBe(2);
    const de = result.countries.find((c) => c.name === 'DE');
    expect(de).toBeDefined();
    expect(de!.visitors).toBe(1);

    // Regions
    const regionNames = result.regions.map((r) => r.name);
    expect(regionNames).toContain('California');
    expect(regionNames).toContain('New York');
    expect(regionNames).toContain('Bavaria');

    // Cities
    const cityNames = result.cities.map((c) => c.name);
    expect(cityNames).toContain('San Francisco');
    expect(cityNames).toContain('New York City');
    expect(cityNames).toContain('Munich');
  });

  it('returns empty results when no pageview events exist', async () => {
    const projectId = randomUUID();

    const result = await queryGeography(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(5),
      date_to: daysAgo(3),
    });

    expect(result.countries).toHaveLength(0);
    expect(result.regions).toHaveLength(0);
    expect(result.cities).toHaveLength(0);
  });
});
