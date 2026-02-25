import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  setupContainers,
  insertTestEvents,
  buildEvent,
  daysAgo,
  ts,
  msAgo,
  dateOffset,
  type ContainerContext,
} from '@qurvo/testing';
import {
  queryOverview,
  queryTopPages,
  querySources,
  queryDevices,
  queryGeography,
} from '../../web-analytics/web-analytics.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await setupContainers();
}, 120_000);

// ── queryOverview ──────────────────────────────────────────────────────────────

describe('queryOverview — KPIs', () => {
  it('counts unique_visitors, pageviews, and sessions correctly', async () => {
    const projectId = randomUUID();
    const sessionA = randomUUID();
    const sessionB = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    // personA: session A — 2 pageviews (not a bounce)
    // personB: session B — 1 pageview (bounce — single pageview, no duration)
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'ua',
        event_name: '$pageview',
        session_id: sessionA,
        timestamp: ts(3, 10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'ua',
        event_name: '$pageview',
        session_id: sessionA,
        timestamp: ts(3, 11),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'ub',
        event_name: '$pageview',
        session_id: sessionB,
        timestamp: ts(3, 12),
      }),
    ]);

    const result = await queryOverview(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(4),
      date_to: daysAgo(2),
    });

    expect(result.current.unique_visitors).toBe(2);
    expect(result.current.pageviews).toBe(3);
    expect(result.current.sessions).toBe(2);
  });

  it('counts bounce rate — user with 1 pageview in session and duration < 10s is a bounce', async () => {
    const projectId = randomUUID();
    const sessionBounce = randomUUID();
    const sessionNonBounce = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    // sessionBounce: 1 pageview only — duration is 0 (single event), should be bounce
    // sessionNonBounce: 2 pageviews — not a bounce
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'ua',
        event_name: '$pageview',
        session_id: sessionBounce,
        timestamp: msAgo(5000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'ub',
        event_name: '$pageview',
        session_id: sessionNonBounce,
        timestamp: msAgo(4000),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'ub',
        event_name: '$pageview',
        session_id: sessionNonBounce,
        timestamp: msAgo(3000),
      }),
    ]);

    const result = await queryOverview(ctx.ch, {
      project_id: projectId,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    });

    // 1 bounce out of 2 sessions = 50%
    expect(result.current.bounce_rate).toBe(50);
  });

  it('calculates avg_duration_seconds', async () => {
    const projectId = randomUUID();
    const session = randomUUID();
    const person = randomUUID();

    // Session: pageview at t=0, pageleave at t=30s → duration 30s
    const start = new Date(Date.now() - 60_000);
    const end = new Date(start.getTime() + 30_000);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'u1',
        event_name: '$pageview',
        session_id: session,
        timestamp: start.toISOString(),
      }),
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'u1',
        event_name: '$pageleave',
        session_id: session,
        timestamp: end.toISOString(),
      }),
    ]);

    const result = await queryOverview(ctx.ch, {
      project_id: projectId,
      date_from: dateOffset(-1),
      date_to: dateOffset(1),
    });

    expect(result.current.avg_duration_seconds).toBe(30);
    expect(result.current.sessions).toBe(1);
    expect(result.current.pageviews).toBe(1);
  });

  it('returns previous period data via shiftPeriod when compare is not requested', async () => {
    const projectId = randomUUID();
    const sessionCurrent = randomUUID();
    const sessionPrevious = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    // Current period: daysAgo(4) to daysAgo(3)
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'ua',
        event_name: '$pageview',
        session_id: sessionCurrent,
        timestamp: ts(3, 12),
      }),
      // Previous period (shifted back by ~2 days): daysAgo(6) to daysAgo(5)
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'ub',
        event_name: '$pageview',
        session_id: sessionPrevious,
        timestamp: ts(6, 12),
      }),
    ]);

    const result = await queryOverview(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(4),
      date_to: daysAgo(3),
    });

    // Current period should have 1 session
    expect(result.current.sessions).toBe(1);
    // Previous period should also have 1 session (same range shifted back)
    expect(result.previous.sessions).toBe(1);
  });

  it('returns empty KPIs when no events exist', async () => {
    const projectId = randomUUID();

    const result = await queryOverview(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(5),
      date_to: daysAgo(3),
    });

    expect(result.current.unique_visitors).toBe(0);
    expect(result.current.pageviews).toBe(0);
    expect(result.current.sessions).toBe(0);
    expect(result.current.bounce_rate).toBe(0);
    expect(result.current.avg_duration_seconds).toBe(0);
  });
});

describe('queryOverview — auto-granularity', () => {
  it('uses hour granularity for date range <= 2 days', async () => {
    const projectId = randomUUID();

    const result = await queryOverview(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(1),
      date_to: daysAgo(0),
    });

    expect(result.granularity).toBe('hour');
  });

  it('uses day granularity for date range 3–89 days', async () => {
    const projectId = randomUUID();

    const result = await queryOverview(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(30),
      date_to: daysAgo(0),
    });

    expect(result.granularity).toBe('day');
  });

  it('uses week granularity for date range 90–364 days', async () => {
    const projectId = randomUUID();

    const result = await queryOverview(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(180),
      date_to: daysAgo(0),
    });

    expect(result.granularity).toBe('week');
  });

  it('uses month granularity for date range >= 365 days', async () => {
    const projectId = randomUUID();

    const result = await queryOverview(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(400),
      date_to: daysAgo(0),
    });

    expect(result.granularity).toBe('month');
  });
});

// ── queryOverview — timeseries ─────────────────────────────────────────────────

describe('queryOverview — timeseries', () => {
  it('groups sessions into daily time buckets', async () => {
    const projectId = randomUUID();
    const sessionA = randomUUID();
    const sessionB = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    // Two sessions on different days
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'ua',
        event_name: '$pageview',
        session_id: sessionA,
        timestamp: ts(4, 12),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'ub',
        event_name: '$pageview',
        session_id: sessionB,
        timestamp: ts(3, 12),
      }),
    ]);

    const result = await queryOverview(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(5),
      date_to: daysAgo(2),
    });

    expect(result.granularity).toBe('day');
    expect(result.timeseries).toHaveLength(2);

    const totalSessions = result.timeseries.reduce((sum, t) => sum + t.sessions, 0);
    expect(totalSessions).toBe(2);

    const totalPageviews = result.timeseries.reduce((sum, t) => sum + t.pageviews, 0);
    expect(totalPageviews).toBe(2);
  });

  it('does not return empty buckets when there are no events in that bucket', async () => {
    const projectId = randomUUID();
    const session = randomUUID();
    const person = randomUUID();

    // Single session 5 days ago, but date_from is 7 days ago — gaps are not filled
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: person,
        distinct_id: 'u1',
        event_name: '$pageview',
        session_id: session,
        timestamp: ts(5, 12),
      }),
    ]);

    const result = await queryOverview(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(7),
      date_to: daysAgo(3),
    });

    // Only 1 bucket (the day with actual data) — empty buckets are not synthesized
    expect(result.timeseries).toHaveLength(1);
    expect(result.timeseries[0].sessions).toBe(1);
  });
});

// ── queryTopPages ──────────────────────────────────────────────────────────────

describe('queryTopPages', () => {
  it('returns top pages, entry pages, and exit pages in visitor-descending order', async () => {
    const projectId = randomUUID();
    const sessionA = randomUUID();
    const sessionB = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    // Both users visit /home, then /about; only personA visits /pricing
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'ua',
        event_name: '$pageview',
        session_id: sessionA,
        page_path: '/home',
        timestamp: ts(3, 10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'ua',
        event_name: '$pageview',
        session_id: sessionA,
        page_path: '/about',
        timestamp: ts(3, 11),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'ua',
        event_name: '$pageview',
        session_id: sessionA,
        page_path: '/pricing',
        timestamp: ts(3, 12),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'ub',
        event_name: '$pageview',
        session_id: sessionB,
        page_path: '/home',
        timestamp: ts(3, 10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'ub',
        event_name: '$pageview',
        session_id: sessionB,
        page_path: '/about',
        timestamp: ts(3, 11),
      }),
    ]);

    const result = await queryTopPages(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(4),
      date_to: daysAgo(2),
    });

    // Top pages ordered by pageviews descending
    expect(result.top_pages.length).toBeGreaterThan(0);
    const paths = result.top_pages.map((p) => p.name);
    expect(paths).toContain('/home');
    expect(paths).toContain('/about');

    // /home has 2 pageviews, /about has 2 pageviews, /pricing has 1 pageview
    // all should be present
    const pricingPage = result.top_pages.find((p) => p.name === '/pricing');
    const homePage = result.top_pages.find((p) => p.name === '/home');
    expect(pricingPage).toBeDefined();
    expect(homePage).toBeDefined();
    expect(homePage!.pageviews).toBeGreaterThanOrEqual(pricingPage!.pageviews);

    // Entry pages: first page of each session
    expect(result.entry_pages.length).toBeGreaterThan(0);
    const entryPaths = result.entry_pages.map((p) => p.name);
    expect(entryPaths).toContain('/home');

    // Exit pages: last page of each session
    expect(result.exit_pages.length).toBeGreaterThan(0);
  });

  it('returns empty results when no pageview events exist', async () => {
    const projectId = randomUUID();

    const result = await queryTopPages(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(5),
      date_to: daysAgo(3),
    });

    expect(result.top_pages).toHaveLength(0);
    expect(result.entry_pages).toHaveLength(0);
    expect(result.exit_pages).toHaveLength(0);
  });
});

// ── querySources ───────────────────────────────────────────────────────────────

describe('querySources', () => {
  it('returns referrers sorted by visitors descending', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();

    // 2 visitors from google.com, 1 from bing.com
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'ua',
        event_name: '$pageview',
        referrer: 'google.com',
        timestamp: ts(3, 10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'ub',
        event_name: '$pageview',
        referrer: 'google.com',
        timestamp: ts(3, 11),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personC,
        distinct_id: 'uc',
        event_name: '$pageview',
        referrer: 'bing.com',
        timestamp: ts(3, 12),
      }),
    ]);

    const result = await querySources(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(4),
      date_to: daysAgo(2),
    });

    expect(result.referrers.length).toBeGreaterThan(0);
    expect(result.referrers[0].name).toBe('google.com');
    expect(result.referrers[0].visitors).toBe(2);

    const bing = result.referrers.find((r) => r.name === 'bing.com');
    expect(bing).toBeDefined();
    expect(bing!.visitors).toBe(1);
  });

  it('returns UTM sources when present in properties', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'ua',
        event_name: '$pageview',
        properties: JSON.stringify({ utm_source: 'newsletter' }),
        timestamp: ts(3, 10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'ub',
        event_name: '$pageview',
        properties: JSON.stringify({ utm_source: 'newsletter' }),
        timestamp: ts(3, 11),
      }),
    ]);

    const result = await querySources(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(4),
      date_to: daysAgo(2),
    });

    expect(result.utm_sources.length).toBeGreaterThan(0);
    expect(result.utm_sources[0].name).toBe('newsletter');
    expect(result.utm_sources[0].visitors).toBe(2);
  });

  it('returns empty results when no pageview events exist', async () => {
    const projectId = randomUUID();

    const result = await querySources(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(5),
      date_to: daysAgo(3),
    });

    expect(result.referrers).toHaveLength(0);
    expect(result.utm_sources).toHaveLength(0);
    expect(result.utm_mediums).toHaveLength(0);
    expect(result.utm_campaigns).toHaveLength(0);
  });
});

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

// ── PropertyFilter support ─────────────────────────────────────────────────────

describe('queryOverview — PropertyFilter', () => {
  it('filters sessions by page_path property filter', async () => {
    const projectId = randomUUID();
    const sessionA = randomUUID();
    const sessionB = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    // sessionA lands on /dashboard, sessionB lands on /home
    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personA,
        distinct_id: 'ua',
        event_name: '$pageview',
        session_id: sessionA,
        page_path: '/dashboard',
        timestamp: ts(3, 10),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personB,
        distinct_id: 'ub',
        event_name: '$pageview',
        session_id: sessionB,
        page_path: '/home',
        timestamp: ts(3, 11),
      }),
    ]);

    const result = await queryOverview(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(4),
      date_to: daysAgo(2),
      filters: [{ property: 'page_path', operator: 'eq', value: '/dashboard' }],
    });

    // Only sessionA passes the filter
    expect(result.current.sessions).toBe(1);
    expect(result.current.unique_visitors).toBe(1);
  });
});
