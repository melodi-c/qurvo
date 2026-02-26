import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  daysAgo,
  ts,
  type ContainerContext,
} from '@qurvo/testing';
import { getTestContext } from '../context';
import {
  queryTopPages,
  querySources,
} from '../../web-analytics/web-analytics.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

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
