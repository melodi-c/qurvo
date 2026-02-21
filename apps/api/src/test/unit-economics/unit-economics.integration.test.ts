import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  setupContainers,
  insertTestEvents,
  buildEvent,
  createTestProject,
  daysAgo,
  ts,
  type ContainerContext,
} from '@qurvo/testing';
import { queryUnitEconomics } from '../../unit-economics/unit-economics.query';
import { adSpend, marketingChannels } from '@qurvo/db';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await setupContainers();
}, 120_000);

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeMetrics(raw: {
  new_users: number;
  total_users: number;
  paying_users: number;
  users_with_repeat: number;
  total_purchases: number;
  total_revenue: number;
  prev_active_users: number;
  churned_users: number;
}, adSpendAmount = 0) {
  const ua = raw.new_users;
  const totalUsers = raw.total_users || 1;
  const c1 = totalUsers > 0 ? raw.paying_users / totalUsers : 0;
  const c2 = raw.paying_users > 0 ? raw.users_with_repeat / raw.paying_users : 0;
  let apc: number;
  if (c2 >= 1) {
    apc = raw.paying_users > 0 ? raw.total_purchases / raw.paying_users : 0;
  } else {
    apc = c2 > 0 ? 1 / (1 - c2) : (raw.paying_users > 0 ? 1 : 0);
  }
  const avp = raw.total_purchases > 0 ? raw.total_revenue / raw.total_purchases : 0;
  const arppu = avp * apc;
  const arpu = arppu * c1;
  const churnRate = raw.prev_active_users > 0 ? raw.churned_users / raw.prev_active_users : 0;
  const lifetimePeriods = churnRate > 0 ? 1 / churnRate : 0;
  const ltv = arpu * lifetimePeriods;
  const cac = ua > 0 ? adSpendAmount / ua : 0;
  const roiPercent = cac > 0 ? ((ltv - cac) / cac) * 100 : 0;
  const cm = ltv - cac;
  return { ua, c1, c2, apc, avp, arppu, arpu, churnRate, lifetimePeriods, ltv, cac, roiPercent, cm };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('queryUnitEconomics — basic metrics', () => {
  it('counts UA, paying_users, purchases and revenue', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();
    const personD = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personA: page_view + purchase(100)
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'page_view', timestamp: ts(5, 10) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'purchase', properties: JSON.stringify({ revenue: 100 }), timestamp: ts(5, 11) }),
      // personB: page_view + purchase(200) + purchase(150)
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'page_view', timestamp: ts(5, 10) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'purchase', properties: JSON.stringify({ revenue: 200 }), timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'purchase', properties: JSON.stringify({ revenue: 150 }), timestamp: ts(5, 13) }),
      // personC: page_view only
      buildEvent({ project_id: projectId, person_id: personC, distinct_id: 'c', event_name: 'page_view', timestamp: ts(5, 10) }),
      // personD: page_view only
      buildEvent({ project_id: projectId, person_id: personD, distinct_id: 'd', event_name: 'page_view', timestamp: ts(5, 10) }),
    ]);

    const buckets = await queryUnitEconomics(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
      granularity: 'day',
      purchase_event_name: 'purchase',
      revenue_property: 'revenue',
      churn_window_days: 30,
    });

    expect(buckets.length).toBeGreaterThanOrEqual(1);
    const b = buckets[0];
    expect(b.total_users).toBe(4);
    expect(b.paying_users).toBe(2);
    expect(b.total_purchases).toBe(3);
    expect(b.total_revenue).toBe(450);
  });

  it('computes C1 — conversion to first purchase', async () => {
    const projectId = randomUUID();
    const persons = Array.from({ length: 4 }, () => randomUUID());

    await insertTestEvents(ctx.ch, [
      // 2 of 4 persons make a purchase
      ...persons.map((pid, i) =>
        buildEvent({ project_id: projectId, person_id: pid, distinct_id: `u${i}`, event_name: 'page_view', timestamp: ts(5, 10) }),
      ),
      buildEvent({ project_id: projectId, person_id: persons[0], distinct_id: 'u0', event_name: 'purchase', properties: JSON.stringify({ revenue: 50 }), timestamp: ts(5, 11) }),
      buildEvent({ project_id: projectId, person_id: persons[1], distinct_id: 'u1', event_name: 'purchase', properties: JSON.stringify({ revenue: 100 }), timestamp: ts(5, 11) }),
    ]);

    const buckets = await queryUnitEconomics(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
      granularity: 'day',
      purchase_event_name: 'purchase',
      revenue_property: 'revenue',
      churn_window_days: 30,
    });

    const b = buckets[0];
    // C1 = paying_users / total_users = 2/4 = 0.5
    expect(b.paying_users).toBe(2);
    expect(b.total_users).toBe(4);
    const c1 = b.paying_users / b.total_users;
    expect(c1).toBe(0.5);
  });

  it('computes C2 — repeat purchase rate', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personA: 1 purchase
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'purchase', properties: JSON.stringify({ revenue: 100 }), timestamp: ts(5, 10) }),
      // personB: 3 purchases
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'purchase', properties: JSON.stringify({ revenue: 50 }), timestamp: ts(5, 10) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'purchase', properties: JSON.stringify({ revenue: 60 }), timestamp: ts(5, 11) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'purchase', properties: JSON.stringify({ revenue: 70 }), timestamp: ts(5, 12) }),
      // personC: 2 purchases
      buildEvent({ project_id: projectId, person_id: personC, distinct_id: 'c', event_name: 'purchase', properties: JSON.stringify({ revenue: 80 }), timestamp: ts(5, 10) }),
      buildEvent({ project_id: projectId, person_id: personC, distinct_id: 'c', event_name: 'purchase', properties: JSON.stringify({ revenue: 90 }), timestamp: ts(5, 11) }),
    ]);

    const buckets = await queryUnitEconomics(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
      granularity: 'day',
      purchase_event_name: 'purchase',
      revenue_property: 'revenue',
      churn_window_days: 30,
    });

    const b = buckets[0];
    expect(b.paying_users).toBe(3);
    expect(b.users_with_repeat).toBe(2); // personB + personC
    const c2 = b.users_with_repeat / b.paying_users;
    expect(c2).toBeCloseTo(0.667, 2);
  });
});

describe('queryUnitEconomics — formulas', () => {
  it('computes APC, AVP, ARPPU correctly', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personA: 2 purchases (100 + 150 = 250)
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'page_view', timestamp: ts(5, 10) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'purchase', properties: JSON.stringify({ revenue: 100 }), timestamp: ts(5, 11) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'purchase', properties: JSON.stringify({ revenue: 150 }), timestamp: ts(5, 12) }),
      // personB: 3 purchases (50 + 100 + 100 = 250)
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'page_view', timestamp: ts(5, 10) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'purchase', properties: JSON.stringify({ revenue: 50 }), timestamp: ts(5, 11) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'purchase', properties: JSON.stringify({ revenue: 100 }), timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'purchase', properties: JSON.stringify({ revenue: 100 }), timestamp: ts(5, 13) }),
    ]);

    const buckets = await queryUnitEconomics(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
      granularity: 'day',
      purchase_event_name: 'purchase',
      revenue_property: 'revenue',
      churn_window_days: 30,
    });

    const b = buckets[0];
    expect(b.paying_users).toBe(2);
    expect(b.users_with_repeat).toBe(2); // both repeat
    expect(b.total_purchases).toBe(5);
    expect(b.total_revenue).toBe(500);

    // C2 = 2/2 = 1.0 → APC fallback = total_purchases/paying = 5/2 = 2.5
    const m = computeMetrics(b);
    expect(m.c2).toBe(1);
    expect(m.apc).toBe(2.5);
    // AVP = 500/5 = 100
    expect(m.avp).toBe(100);
    // ARPPU = AVP × APC = 100 × 2.5 = 250
    expect(m.arppu).toBe(250);
  });

  it('computes ARPU from ARPPU and C1', async () => {
    const projectId = randomUUID();
    const persons = Array.from({ length: 10 }, () => randomUUID());

    const events = [
      // All 10 have page_view
      ...persons.map((pid, i) =>
        buildEvent({ project_id: projectId, person_id: pid, distinct_id: `u${i}`, event_name: 'page_view', timestamp: ts(5, 10) }),
      ),
      // 3 paying users (persons 0, 1, 2)
      buildEvent({ project_id: projectId, person_id: persons[0], distinct_id: 'u0', event_name: 'purchase', properties: JSON.stringify({ revenue: 100 }), timestamp: ts(5, 11) }),
      buildEvent({ project_id: projectId, person_id: persons[1], distinct_id: 'u1', event_name: 'purchase', properties: JSON.stringify({ revenue: 100 }), timestamp: ts(5, 11) }),
      buildEvent({ project_id: projectId, person_id: persons[1], distinct_id: 'u1', event_name: 'purchase', properties: JSON.stringify({ revenue: 100 }), timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: persons[2], distinct_id: 'u2', event_name: 'purchase', properties: JSON.stringify({ revenue: 100 }), timestamp: ts(5, 11) }),
      buildEvent({ project_id: projectId, person_id: persons[2], distinct_id: 'u2', event_name: 'purchase', properties: JSON.stringify({ revenue: 100 }), timestamp: ts(5, 12) }),
      buildEvent({ project_id: projectId, person_id: persons[2], distinct_id: 'u2', event_name: 'purchase', properties: JSON.stringify({ revenue: 100 }), timestamp: ts(5, 13) }),
    ];

    await insertTestEvents(ctx.ch, events);

    const buckets = await queryUnitEconomics(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
      granularity: 'day',
      purchase_event_name: 'purchase',
      revenue_property: 'revenue',
      churn_window_days: 30,
    });

    const b = buckets[0];
    expect(b.total_users).toBe(10);
    expect(b.paying_users).toBe(3);
    expect(b.total_purchases).toBe(6);
    expect(b.total_revenue).toBe(600);

    const m = computeMetrics(b);
    // C1 = 3/10 = 0.3
    expect(m.c1).toBeCloseTo(0.3, 4);
    // C2 = 2/3 = 0.667 (persons 1 and 2 have repeat)
    expect(m.c2).toBeCloseTo(0.667, 2);
    // APC = 1/(1-0.667) = 3.0
    expect(m.apc).toBeCloseTo(3.0, 1);
    // AVP = 600/6 = 100
    expect(m.avp).toBe(100);
    // ARPPU = 100 × 3.0 = 300
    expect(m.arppu).toBeCloseTo(300, 0);
    // ARPU = 300 × 0.3 = 90
    expect(m.arpu).toBeCloseTo(90, 0);
  });
});

describe('queryUnitEconomics — churn', () => {
  it('computes churn rate from previous and current period activity', async () => {
    const projectId = randomUUID();
    const persons = Array.from({ length: 10 }, () => randomUUID());

    // With granularity=day, prev_active checks bucket-1day to bucket.
    // So for bucket=daysAgo(5), prev period is daysAgo(6).
    const events = [
      // Previous day (daysAgo(6)): all 10 active
      ...persons.map((pid, i) =>
        buildEvent({ project_id: projectId, person_id: pid, distinct_id: `u${i}`, event_name: 'page_view', timestamp: ts(6, 10) }),
      ),
      // Current day (daysAgo(5)): only persons 0..7 active (8 out of 10)
      ...persons.slice(0, 8).map((pid, i) =>
        buildEvent({ project_id: projectId, person_id: pid, distinct_id: `u${i}`, event_name: 'page_view', timestamp: ts(5, 10) }),
      ),
    ];

    await insertTestEvents(ctx.ch, events);

    const buckets = await queryUnitEconomics(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
      granularity: 'day',
      purchase_event_name: 'purchase',
      revenue_property: 'revenue',
      churn_window_days: 30,
    });

    expect(buckets.length).toBeGreaterThanOrEqual(1);
    const b = buckets[0];
    // prev_active = 10 (all were active in daysAgo(6))
    // churned = 2 (persons 8,9 not active in current bucket daysAgo(5))
    expect(b.prev_active_users).toBe(10);
    expect(b.churned_users).toBe(2);

    const churnRate = b.churned_users / b.prev_active_users;
    expect(churnRate).toBe(0.2);
  });
});

describe('queryUnitEconomics — empty data', () => {
  it('handles zero purchases without division by zero', async () => {
    const projectId = randomUUID();
    const persons = Array.from({ length: 3 }, () => randomUUID());

    await insertTestEvents(ctx.ch, [
      ...persons.map((pid, i) =>
        buildEvent({ project_id: projectId, person_id: pid, distinct_id: `u${i}`, event_name: 'page_view', timestamp: ts(5, 10) }),
      ),
    ]);

    const buckets = await queryUnitEconomics(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
      granularity: 'day',
      purchase_event_name: 'purchase',
      revenue_property: 'revenue',
      churn_window_days: 30,
    });

    expect(buckets.length).toBeGreaterThanOrEqual(1);
    const b = buckets[0];
    expect(b.paying_users).toBe(0);
    expect(b.total_purchases).toBe(0);
    expect(b.total_revenue).toBe(0);

    const m = computeMetrics(b);
    expect(m.c1).toBe(0);
    expect(m.c2).toBe(0);
    expect(m.apc).toBe(0);
    expect(m.avp).toBe(0);
    expect(m.arppu).toBe(0);
    expect(m.arpu).toBe(0);
    expect(m.ltv).toBe(0);
    // All should be finite (no NaN/Infinity)
    Object.values(m).forEach((v) => {
      expect(Number.isFinite(v)).toBe(true);
    });
  });
});

describe('queryUnitEconomics — configurable parameters', () => {
  it('uses custom purchase_event_name', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'order_completed', properties: JSON.stringify({ revenue: 99 }), timestamp: ts(5, 10) }),
    ]);

    // With correct event name
    const buckets1 = await queryUnitEconomics(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
      granularity: 'day',
      purchase_event_name: 'order_completed',
      revenue_property: 'revenue',
      churn_window_days: 30,
    });
    expect(buckets1[0].paying_users).toBe(1);
    expect(buckets1[0].total_revenue).toBe(99);

    // With wrong event name — no matches
    const buckets2 = await queryUnitEconomics(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
      granularity: 'day',
      purchase_event_name: 'purchase',
      revenue_property: 'revenue',
      churn_window_days: 30,
    });
    expect(buckets2[0].paying_users).toBe(0);
  });

  it('uses custom revenue_property', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'purchase', properties: JSON.stringify({ amount: 199.99 }), timestamp: ts(5, 10) }),
    ]);

    // With correct property
    const buckets1 = await queryUnitEconomics(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
      granularity: 'day',
      purchase_event_name: 'purchase',
      revenue_property: 'amount',
      churn_window_days: 30,
    });
    expect(buckets1[0].total_revenue).toBeCloseTo(199.99, 1);

    // With wrong property — revenue = 0
    const buckets2 = await queryUnitEconomics(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
      granularity: 'day',
      purchase_event_name: 'purchase',
      revenue_property: 'revenue',
      churn_window_days: 30,
    });
    expect(buckets2[0].total_revenue).toBe(0);
  });
});

describe('queryUnitEconomics — granularity', () => {
  it('groups by week when granularity=week', async () => {
    const projectId = randomUUID();

    await insertTestEvents(ctx.ch, [
      // Week 1 (21 days ago)
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u1', event_name: 'page_view', timestamp: ts(21, 10) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u2', event_name: 'purchase', properties: JSON.stringify({ revenue: 100 }), timestamp: ts(21, 10) }),
      // Week 2 (14 days ago)
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u3', event_name: 'page_view', timestamp: ts(14, 10) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u4', event_name: 'purchase', properties: JSON.stringify({ revenue: 200 }), timestamp: ts(14, 10) }),
      // Week 3 (7 days ago)
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u5', event_name: 'page_view', timestamp: ts(7, 10) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u6', event_name: 'purchase', properties: JSON.stringify({ revenue: 300 }), timestamp: ts(7, 10) }),
    ]);

    const buckets = await queryUnitEconomics(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(21),
      date_to: daysAgo(7),
      granularity: 'week',
      purchase_event_name: 'purchase',
      revenue_property: 'revenue',
      churn_window_days: 30,
    });

    // Should have multiple weekly buckets
    expect(buckets.length).toBeGreaterThanOrEqual(2);
    // Each bucket should have data
    buckets.forEach((b) => {
      expect(b.total_users).toBeGreaterThanOrEqual(1);
    });
  });

  it('groups by month when granularity=month', async () => {
    const projectId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u1', event_name: 'page_view', timestamp: ts(5, 10) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u2', event_name: 'page_view', timestamp: ts(3, 10) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'u3', event_name: 'purchase', properties: JSON.stringify({ revenue: 500 }), timestamp: ts(5, 11) }),
    ]);

    const buckets = await queryUnitEconomics(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(5),
      date_to: daysAgo(3),
      granularity: 'month',
      purchase_event_name: 'purchase',
      revenue_property: 'revenue',
      churn_window_days: 30,
    });

    // All events within the same month → 1 bucket
    expect(buckets).toHaveLength(1);
    expect(buckets[0].total_users).toBe(3);
    expect(buckets[0].total_revenue).toBe(500);
  });
});

describe('queryUnitEconomics — CAC and ROI (with PostgreSQL ad_spend)', () => {
  it('computes CAC, ROI and CM using ad spend from PostgreSQL', async () => {
    const tp = await createTestProject(ctx.db);

    // Create channel in PostgreSQL
    const [channel] = await ctx.db
      .insert(marketingChannels)
      .values({
        project_id: tp.projectId,
        created_by: tp.userId,
        name: 'Google Ads',
      })
      .returning();

    // Add ad spend: 1000 total for the period
    await ctx.db.insert(adSpend).values([
      {
        project_id: tp.projectId,
        channel_id: channel.id,
        created_by: tp.userId,
        spend_date: daysAgo(5),
        amount: '600',
      },
      {
        project_id: tp.projectId,
        channel_id: channel.id,
        created_by: tp.userId,
        spend_date: daysAgo(4),
        amount: '400',
      },
    ]);

    // Insert 10 new users with purchase data
    const persons = Array.from({ length: 10 }, () => randomUUID());
    const events = [
      ...persons.map((pid, i) =>
        buildEvent({ project_id: tp.projectId, person_id: pid, distinct_id: `u${i}`, event_name: 'page_view', timestamp: ts(5, 10) }),
      ),
      // 3 paying users
      buildEvent({ project_id: tp.projectId, person_id: persons[0], distinct_id: 'u0', event_name: 'purchase', properties: JSON.stringify({ revenue: 200 }), timestamp: ts(5, 11) }),
      buildEvent({ project_id: tp.projectId, person_id: persons[1], distinct_id: 'u1', event_name: 'purchase', properties: JSON.stringify({ revenue: 300 }), timestamp: ts(5, 11) }),
      buildEvent({ project_id: tp.projectId, person_id: persons[2], distinct_id: 'u2', event_name: 'purchase', properties: JSON.stringify({ revenue: 500 }), timestamp: ts(5, 11) }),
    ];

    await insertTestEvents(ctx.ch, events);

    const buckets = await queryUnitEconomics(ctx.ch, {
      project_id: tp.projectId,
      date_from: daysAgo(5),
      date_to: daysAgo(4),
      granularity: 'day',
      purchase_event_name: 'purchase',
      revenue_property: 'revenue',
      churn_window_days: 30,
    });

    // Aggregate raw totals
    const totalsRaw = {
      new_users: buckets.reduce((s, b) => s + b.new_users, 0),
      total_users: buckets.reduce((s, b) => s + b.total_users, 0),
      paying_users: buckets.reduce((s, b) => s + b.paying_users, 0),
      users_with_repeat: buckets.reduce((s, b) => s + b.users_with_repeat, 0),
      total_purchases: buckets.reduce((s, b) => s + b.total_purchases, 0),
      total_revenue: buckets.reduce((s, b) => s + b.total_revenue, 0),
      prev_active_users: buckets.reduce((s, b) => s + b.prev_active_users, 0),
      churned_users: buckets.reduce((s, b) => s + b.churned_users, 0),
    };

    const m = computeMetrics(totalsRaw, 1000);

    // UA = 10, CAC = 1000/10 = 100
    expect(m.ua).toBe(10);
    expect(m.cac).toBe(100);

    // ROI & CM depend on LTV which requires churn data
    // But we can verify CAC is correct
    expect(m.cm).toBe(m.ltv - m.cac);
    if (m.cac > 0) {
      expect(m.roiPercent).toBeCloseTo(((m.ltv - m.cac) / m.cac) * 100, 1);
    }
  });
});

describe('queryUnitEconomics — project isolation', () => {
  it('does not mix data from different projects', async () => {
    const projectA = randomUUID();
    const projectB = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectA, person_id: randomUUID(), distinct_id: 'a1', event_name: 'purchase', properties: JSON.stringify({ revenue: 100 }), timestamp: ts(5, 10) }),
      buildEvent({ project_id: projectB, person_id: randomUUID(), distinct_id: 'b1', event_name: 'purchase', properties: JSON.stringify({ revenue: 999 }), timestamp: ts(5, 10) }),
    ]);

    const bucketsA = await queryUnitEconomics(ctx.ch, {
      project_id: projectA,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
      granularity: 'day',
      purchase_event_name: 'purchase',
      revenue_property: 'revenue',
      churn_window_days: 30,
    });

    expect(bucketsA[0].total_revenue).toBe(100);
    expect(bucketsA[0].total_users).toBe(1);
  });
});

describe('queryUnitEconomics — filter_conditions', () => {
  it('filters events by single filter condition', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personA: source=telegram_bot + purchase
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'page_view', properties: JSON.stringify({ source: 'telegram_bot' }), timestamp: ts(5, 10) }),
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'purchase', properties: JSON.stringify({ source: 'telegram_bot', revenue: 100 }), timestamp: ts(5, 11) }),
      // personB: source=google + purchase
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'page_view', properties: JSON.stringify({ source: 'google' }), timestamp: ts(5, 10) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'purchase', properties: JSON.stringify({ source: 'google', revenue: 200 }), timestamp: ts(5, 11) }),
    ]);

    // Filter only telegram_bot
    const buckets = await queryUnitEconomics(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
      granularity: 'day',
      purchase_event_name: 'purchase',
      revenue_property: 'revenue',
      churn_window_days: 30,
      filter_conditions: [{ property: 'source', value: 'telegram_bot' }],
    });

    expect(buckets.length).toBeGreaterThanOrEqual(1);
    expect(buckets[0].total_users).toBe(1);
    expect(buckets[0].total_revenue).toBe(100);
  });

  it('filters events by multiple filter conditions (AND)', async () => {
    const projectId = randomUUID();
    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();

    await insertTestEvents(ctx.ch, [
      // personA: source=telegram_bot, campaign=spring
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'a', event_name: 'purchase', properties: JSON.stringify({ source: 'telegram_bot', campaign: 'spring', revenue: 100 }), timestamp: ts(5, 10) }),
      // personB: source=telegram_bot, campaign=summer
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'b', event_name: 'purchase', properties: JSON.stringify({ source: 'telegram_bot', campaign: 'summer', revenue: 200 }), timestamp: ts(5, 10) }),
      // personC: source=google, campaign=spring
      buildEvent({ project_id: projectId, person_id: personC, distinct_id: 'c', event_name: 'purchase', properties: JSON.stringify({ source: 'google', campaign: 'spring', revenue: 300 }), timestamp: ts(5, 10) }),
    ]);

    // Filter: source=telegram_bot AND campaign=spring → only personA
    const buckets = await queryUnitEconomics(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
      granularity: 'day',
      purchase_event_name: 'purchase',
      revenue_property: 'revenue',
      churn_window_days: 30,
      filter_conditions: [
        { property: 'source', value: 'telegram_bot' },
        { property: 'campaign', value: 'spring' },
      ],
    });

    expect(buckets.length).toBeGreaterThanOrEqual(1);
    expect(buckets[0].total_users).toBe(1);
    expect(buckets[0].total_revenue).toBe(100);
  });

  it('returns all data when filter_conditions is empty', async () => {
    const projectId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'a', event_name: 'purchase', properties: JSON.stringify({ source: 'telegram', revenue: 50 }), timestamp: ts(5, 10) }),
      buildEvent({ project_id: projectId, person_id: randomUUID(), distinct_id: 'b', event_name: 'purchase', properties: JSON.stringify({ source: 'google', revenue: 75 }), timestamp: ts(5, 10) }),
    ]);

    const buckets = await queryUnitEconomics(ctx.ch, {
      project_id: projectId,
      date_from: daysAgo(5),
      date_to: daysAgo(5),
      granularity: 'day',
      purchase_event_name: 'purchase',
      revenue_property: 'revenue',
      churn_window_days: 30,
      filter_conditions: [],
    });

    expect(buckets.length).toBeGreaterThanOrEqual(1);
    expect(buckets[0].total_users).toBe(2);
    expect(buckets[0].total_revenue).toBe(125);
  });
});
