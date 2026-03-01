import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  daysAgo,
  ts,
  msAgo,
  dateOffset,
  type ContainerContext,
} from '@qurvo/testing';
import { getTestContext } from '../context';
import {
  queryOverview,
} from '../../web-analytics/web-analytics.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
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
      timezone: 'UTC',
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
      timezone: 'UTC',
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
      timezone: 'UTC',
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
      timezone: 'UTC',
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
      timezone: 'UTC',
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
      timezone: 'UTC',
    });

    expect(result.granularity).toBe('hour');
  });

  it('uses day granularity for date range 3–89 days', async () => {
    const projectId = randomUUID();

    const result = await queryOverview(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(30),
      date_to: daysAgo(0),
      timezone: 'UTC',
    });

    expect(result.granularity).toBe('day');
  });

  it('uses week granularity for date range 90–364 days', async () => {
    const projectId = randomUUID();

    const result = await queryOverview(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(180),
      date_to: daysAgo(0),
      timezone: 'UTC',
    });

    expect(result.granularity).toBe('week');
  });

  it('uses month granularity for date range >= 365 days', async () => {
    const projectId = randomUUID();

    const result = await queryOverview(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(400),
      date_to: daysAgo(0),
      timezone: 'UTC',
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
      timezone: 'UTC',
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
      timezone: 'UTC',
    });

    // Only 1 bucket (the day with actual data) — empty buckets are not synthesized
    expect(result.timeseries).toHaveLength(1);
    expect(result.timeseries[0].sessions).toBe(1);
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
      timezone: 'UTC',
      filters: [{ property: 'page_path', operator: 'eq', value: '/dashboard' }],
    });

    // Only sessionA passes the filter
    expect(result.current.sessions).toBe(1);
    expect(result.current.unique_visitors).toBe(1);
  });
});
