import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  msAgo,
} from '@qurvo/testing';
import { getTestContext, type ContainerContext } from '../context';
import { countCohortMembers } from '../../cohorts/cohorts.query';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await getTestContext();
}, 120_000);

// ── person_property conditions ──────────────────────────────────────────────

describe('countCohortMembers — person_property conditions', () => {
  it('counts persons matching eq condition on user_properties', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'premium-user',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'free-user',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' },
      ],
    });

    expect(count).toBe(1);
  });

  it('counts persons matching neq condition', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-a',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-b',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-c',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'plan', operator: 'neq', value: 'premium' },
      ],
    });

    expect(count).toBe(2);
  });

  it('counts persons matching contains condition', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-a',
        event_name: '$set',
        user_properties: JSON.stringify({ company: 'Acme Corp' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-b',
        event_name: '$set',
        user_properties: JSON.stringify({ company: 'Beta Inc' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'company', operator: 'contains', value: 'Acme' },
      ],
    });

    expect(count).toBe(1);
  });
});

// ── Date operators ──────────────────────────────────────────────────────────

describe('countCohortMembers — date operators', () => {
  it('is_date_before: filters persons by signup_date', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'early-user',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: '2025-01-15' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'late-user',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: '2025-06-20' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'signup_date', operator: 'is_date_before', value: '2025-03-01' },
      ],
    });

    expect(count).toBe(1);
  });

  it('is_date_after: filters persons by signup_date', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'early-user',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: '2025-01-15' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'late-user',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: '2025-06-20' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'signup_date', operator: 'is_date_after', value: '2025-03-01' },
      ],
    });

    expect(count).toBe(1);
  });

  it('is_date_before: boundary — user with date exactly equal to boundary is NOT included (strict <)', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'boundary-user',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: '2025-03-01' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'before-boundary-user',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: '2025-02-28' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'after-boundary-user',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: '2025-03-02' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        // is_date_before uses strict < so boundary date (2025-03-01) must NOT be included
        { type: 'person_property', property: 'signup_date', operator: 'is_date_before', value: '2025-03-01' },
      ],
    });

    // only before-boundary-user (2025-02-28) qualifies; boundary itself (2025-03-01) is excluded
    expect(count).toBe(1);
  });

  it('is_date_after: boundary — user with date exactly equal to boundary is NOT included (strict >)', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'boundary-user',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: '2025-03-01' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'before-boundary-user',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: '2025-02-28' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'after-boundary-user',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: '2025-03-02' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        // is_date_after uses strict > so boundary date (2025-03-01) must NOT be included
        { type: 'person_property', property: 'signup_date', operator: 'is_date_after', value: '2025-03-01' },
      ],
    });

    // only after-boundary-user (2025-03-02) qualifies; boundary itself (2025-03-01) is excluded
    expect(count).toBe(1);
  });

  it('is_date_exact: matches by day regardless of time', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'target-user',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: '2025-03-15T14:30:00Z' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'other-user',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: '2025-03-16' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'signup_date', operator: 'is_date_exact', value: '2025-03-15' },
      ],
    });

    expect(count).toBe(1);
  });
});

// ── Numeric and set operators on person_property ─────────────────────────────

describe('countCohortMembers — numeric and set operators for person_property', () => {
  it('is_set: counts persons where user_property is present (non-empty)', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-with-company',
        event_name: '$set',
        user_properties: JSON.stringify({ company: 'Acme Corp' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-without-company',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'company', operator: 'is_set' },
      ],
    });

    expect(count).toBe(1);
  });

  it('is_not_set: counts persons where user_property is absent (empty)', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-with-company',
        event_name: '$set',
        user_properties: JSON.stringify({ company: 'Acme Corp' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-without-company',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'free' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'another-without-company',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'company', operator: 'is_not_set' },
      ],
    });

    expect(count).toBe(2);
  });

  it('gt: counts persons where numeric user_property > threshold', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-age-30',
        event_name: '$set',
        user_properties: JSON.stringify({ age: 30 }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-age-25',
        event_name: '$set',
        user_properties: JSON.stringify({ age: 25 }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-age-20',
        event_name: '$set',
        user_properties: JSON.stringify({ age: 20 }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'age', operator: 'gt', value: '25' },
      ],
    });

    // only user-age-30 has age > 25
    expect(count).toBe(1);
  });

  it('lt: counts persons where numeric user_property < threshold', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-score-50',
        event_name: '$set',
        user_properties: JSON.stringify({ score: 50 }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-score-100',
        event_name: '$set',
        user_properties: JSON.stringify({ score: 100 }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-score-150',
        event_name: '$set',
        user_properties: JSON.stringify({ score: 150 }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'score', operator: 'lt', value: '100' },
      ],
    });

    // only user-score-50 has score < 100
    expect(count).toBe(1);
  });

  it('gte: counts persons where numeric user_property >= threshold', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-score-50',
        event_name: '$set',
        user_properties: JSON.stringify({ score: 50 }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-score-100',
        event_name: '$set',
        user_properties: JSON.stringify({ score: 100 }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-score-150',
        event_name: '$set',
        user_properties: JSON.stringify({ score: 150 }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'score', operator: 'gte', value: '100' },
      ],
    });

    // user-score-100 (score=100) and user-score-150 (score=150) both qualify
    expect(count).toBe(2);
  });

  it('lte: counts persons where numeric user_property <= threshold', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-score-50',
        event_name: '$set',
        user_properties: JSON.stringify({ score: 50 }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-score-100',
        event_name: '$set',
        user_properties: JSON.stringify({ score: 100 }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-score-150',
        event_name: '$set',
        user_properties: JSON.stringify({ score: 150 }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'score', operator: 'lte', value: '100' },
      ],
    });

    // user-score-50 (score=50) and user-score-100 (score=100) both qualify
    expect(count).toBe(2);
  });
});

// ── Multi-substring operators ───────────────────────────────────────────────

describe('countCohortMembers — multi-substring operators', () => {
  it('contains_multi: matches persons with any of the substrings', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'gmail-user',
        event_name: '$set',
        user_properties: JSON.stringify({ email: 'alice@gmail.com' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'yahoo-user',
        event_name: '$set',
        user_properties: JSON.stringify({ email: 'bob@yahoo.com' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'outlook-user',
        event_name: '$set',
        user_properties: JSON.stringify({ email: 'carol@outlook.com' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'email', operator: 'contains_multi', values: ['gmail', 'yahoo'] },
      ],
    });

    expect(count).toBe(2);
  });

  it('not_contains_multi: excludes persons with any of the substrings', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'gmail-user',
        event_name: '$set',
        user_properties: JSON.stringify({ email: 'alice@gmail.com' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'yahoo-user',
        event_name: '$set',
        user_properties: JSON.stringify({ email: 'bob@yahoo.com' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'outlook-user',
        event_name: '$set',
        user_properties: JSON.stringify({ email: 'carol@outlook.com' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'email', operator: 'not_contains_multi', values: ['gmail', 'yahoo'] },
      ],
    });

    expect(count).toBe(1);
  });
});
