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
      // user without 'plan' property at all:
      // With JSONHas guard, neq requires the key to exist. Users without the key
      // are excluded (aligned with analytics filters.ts neq behavior).
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-no-plan',
        event_name: '$set',
        user_properties: JSON.stringify({ company: 'Acme' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'plan', operator: 'neq', value: 'premium' },
      ],
    });

    // user-b and user-c have plan='free' (not 'premium').
    // user-no-plan has no 'plan' key → JSONHas returns false → excluded by neq guard.
    // Total: 2.
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
      // target-user: stored as ISO datetime — is_date_exact strips time via toDate(), so it matches.
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'target-user',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: '2025-03-15T14:30:00Z' }),
        timestamp,
      }),
      // other-user-next-day: signed up on 2025-03-16 — one day after target, must NOT match.
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'other-user-next-day',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: '2025-03-16' }),
        timestamp,
      }),
      // other-user-different-month: signed up on 2025-04-01 — completely different date, must NOT match.
      // This second negative case ensures that if the implementation returns all users (broken),
      // count would be 3 instead of 1, catching the false-positive scenario.
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'other-user-different-month',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: '2025-04-01' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'signup_date', operator: 'is_date_exact', value: '2025-03-15' },
      ],
    });

    // Only target-user qualifies. other-user-next-day (2025-03-16) and
    // other-user-different-month (2025-04-01) must be excluded.
    // With 3 users total, a broken implementation returning all users would yield count=3, not 1.
    expect(count).toBe(1);
  });
});

// ── Date operators — epoch false positive protection ─────────────────────────

describe('countCohortMembers — date operators epoch false positive protection', () => {
  it('is_date_before: user with non-date string property ("premium") is NOT matched', async () => {
    // Bug: parseDateTimeBestEffortOrZero("premium") returned 1970-01-01 (epoch).
    // For is_date_before('2025-01-01'): epoch (1970) < 2025 = true — false positive.
    // Fix: add AND parseDateTimeBestEffortOrZero(expr) != toDateTime(0) guard.
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'non-date-user',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: 'premium' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'date-user',
        event_name: '$set',
        user_properties: JSON.stringify({ plan: '2020-06-01' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        // non-date-user has plan="premium" — parseDateTimeBestEffortOrZero("premium") = epoch.
        // Without fix: epoch < 2025-01-01 is true → false match.
        // With fix: epoch != toDateTime(0) is false → excluded correctly.
        // date-user has plan="2020-06-01" which is before 2025-01-01 → matched.
        { type: 'person_property', property: 'plan', operator: 'is_date_before', value: '2025-01-01' },
      ],
    });

    // Only date-user ('2020-06-01' < '2025-01-01') qualifies.
    // non-date-user ('premium') must NOT be matched.
    expect(count).toBe(1);
  });

  it('is_date_after: user with non-date string property is NOT matched', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'non-date-user',
        event_name: '$set',
        user_properties: JSON.stringify({ status: 'active' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'date-user',
        event_name: '$set',
        user_properties: JSON.stringify({ status: '2026-01-01' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        // non-date-user has status="active" → parseDateTimeBestEffortOrZero = epoch → excluded.
        // date-user has status="2026-01-01" which is after '2025-01-01' → matched.
        { type: 'person_property', property: 'status', operator: 'is_date_after', value: '2025-01-01' },
      ],
    });

    expect(count).toBe(1);
  });

  it('is_date_exact: user with non-date string property is NOT matched', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'non-date-user',
        event_name: '$set',
        user_properties: JSON.stringify({ trial_start: 'enterprise' }),
        timestamp,
      }),
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'date-user',
        event_name: '$set',
        user_properties: JSON.stringify({ trial_start: '2025-03-15' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'trial_start', operator: 'is_date_exact', value: '2025-03-15' },
      ],
    });

    // Only date-user with matching date. non-date-user ('enterprise') must NOT be matched.
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
      // user with company set to empty string:
      // With JSONHas, company='' is treated as SET (key exists in JSON).
      // Aligned with analytics filters.ts is_set behavior.
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-empty-company',
        event_name: '$set',
        user_properties: JSON.stringify({ company: '' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'company', operator: 'is_set' },
      ],
    });

    // user-with-company: JSONHas returns true (key exists with value 'Acme Corp').
    // user-empty-company: JSONHas returns true (key exists, even though value is '').
    // user-without-company: JSONHas returns false (no 'company' key).
    // Total: 2.
    expect(count).toBe(2);
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
      // user with company explicitly set to empty string:
      // With NOT JSONHas, company='' is treated as SET (key exists), so NOT is_not_set.
      // Aligned with analytics filters.ts is_not_set behavior.
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'user-empty-company',
        event_name: '$set',
        user_properties: JSON.stringify({ company: '' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'company', operator: 'is_not_set' },
      ],
    });

    // user-without-company and another-without-company: no 'company' key → NOT JSONHas = true.
    // user-empty-company: company='' → JSONHas returns true → NOT JSONHas = false → excluded.
    // Total: 2 (only truly absent keys are classified as is_not_set).
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

// ── Date operator: epoch false-positive (Bug #585) ──────────────────────────
//
// parseDateTimeBestEffortOrZero("premium") returns 1970-01-01 00:00:00 (epoch).
// Without the epoch guard, is_date_before('2020-01-01') would produce:
//   1970-01-01 < 2020-01-01 = true  →  false positive.
//
// The fix wraps date comparisons with:
//   parseDateTimeBestEffortOrZero(expr) != toDateTime(0) AND ...
// so non-date strings (like "premium") never match.

describe('countCohortMembers — date operator epoch false-positive guard (Bug #585)', () => {
  it('is_date_before: user with non-date string property does NOT match (no epoch false positive)', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      // User with a non-date string property — parseDateTimeBestEffortOrZero("premium") = epoch.
      // Before the fix this would match is_date_before('2020-01-01') because 1970-01-01 < 2020-01-01.
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'non-date-user',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: 'premium' }),
        timestamp,
      }),
      // User with a valid early date — must still match.
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'valid-early-user',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: '2018-05-01' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'signup_date', operator: 'is_date_before', value: '2020-01-01' },
      ],
    });

    // Only valid-early-user qualifies (2018-05-01 < 2020-01-01).
    // non-date-user must NOT match despite parseDateTimeBestEffortOrZero("premium") returning epoch.
    expect(count).toBe(1);
  });

  it('is_date_after: user with non-date string property does NOT match (no epoch false positive)', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      // Non-date user — parseDateTimeBestEffortOrZero("enterprise") = epoch.
      // Without the guard, is_date_after('1960-01-01') would be: 1970-01-01 > 1960-01-01 = true (false positive).
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'non-date-user',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: 'enterprise' }),
        timestamp,
      }),
      // Valid recent user — must match is_date_after('1960-01-01').
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'valid-recent-user',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: '2023-08-10' }),
        timestamp,
      }),
    ]);

    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'signup_date', operator: 'is_date_after', value: '1960-01-01' },
      ],
    });

    // Only valid-recent-user qualifies.
    // non-date-user must NOT match even though epoch (1970) > 1960.
    expect(count).toBe(1);
  });

  it('is_date_exact: user with non-date string property does NOT match (no epoch false positive)', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      // Non-date user.
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'non-date-user',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: 'free' }),
        timestamp,
      }),
      // Valid user with a real date that does not match — must not be included.
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'valid-nonmatching-user',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: '2022-06-15' }),
        timestamp,
      }),
    ]);

    // Query: is_date_exact '1970-01-01'.
    // non-date-user: parseDateTimeBestEffortOrZero("free") = epoch, BUT the epoch guard
    // (parseDateTimeBestEffortOrZero(expr) != toDateTime(0)) excludes it.
    // valid-nonmatching-user: 2022-06-15 != 1970-01-01, excluded by comparison.
    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'signup_date', operator: 'is_date_exact', value: '1970-01-01' },
      ],
    });

    // Both users are excluded: non-date-user by epoch guard, valid-nonmatching-user by comparison.
    expect(count).toBe(0);
  });

  it('is_date_before with empty value returns 0 matches (no ClickHouse exception)', async () => {
    const projectId = randomUUID();
    const timestamp = msAgo(0);

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: randomUUID(),
        distinct_id: 'any-user',
        event_name: '$set',
        user_properties: JSON.stringify({ signup_date: '2024-01-01' }),
        timestamp,
      }),
    ]);

    // Empty value — builder returns '1=0' (always-false), no parseDateTimeBestEffort call.
    const count = await countCohortMembers(ctx.ch, projectId, {
      type: 'AND',
      values: [
        { type: 'person_property', property: 'signup_date', operator: 'is_date_before', value: '' as any },
      ],
    });

    expect(count).toBe(0);
  });
});
