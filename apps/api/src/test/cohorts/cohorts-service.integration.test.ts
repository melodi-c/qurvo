import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestProject, insertTestEvents, buildEvent, msAgo, pollUntil } from '@qurvo/testing';
import { eq } from 'drizzle-orm';
import { cohorts } from '@qurvo/db';
import { getTestContext, type ContainerContext } from '../context';
import { CohortsService } from '../../cohorts/cohorts.service';
import { CohortNotFoundException } from '../../cohorts/exceptions/cohort-not-found.exception';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';
import { materializeCohort, insertStaticCohortMembers } from './helpers';

let ctx: ContainerContext;
let service: CohortsService;

beforeAll(async () => {
  ctx = await getTestContext();
  service = new CohortsService(ctx.db as any, ctx.ch as any);
}, 120_000);

// ── getByIds: deterministic ORDER BY id ──────────────────────────────────────

describe('CohortsService.resolveCohortFilters — deterministic ordering', () => {
  it('returns cohorts in consistent id-sorted order regardless of the order of the input ids', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const cohortA = await service.create(userId, projectId, {
      name: 'Cohort A',
      definition: { type: 'AND', values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'a' }] },
    });
    const cohortB = await service.create(userId, projectId, {
      name: 'Cohort B',
      definition: { type: 'AND', values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'b' }] },
    });
    const cohortC = await service.create(userId, projectId, {
      name: 'Cohort C',
      definition: { type: 'AND', values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'c' }] },
    });

    // Resolve in two different orders — the returned array must be identical
    const filters1 = await service.resolveCohortFilters(projectId, [cohortA.id, cohortB.id, cohortC.id]);
    const filters2 = await service.resolveCohortFilters(projectId, [cohortC.id, cohortA.id, cohortB.id]);
    const filters3 = await service.resolveCohortFilters(projectId, [cohortB.id, cohortC.id, cohortA.id]);

    // All three calls must produce the same ordered list (sorted by cohort id)
    expect(filters1.map((f) => f.cohort_id)).toEqual(filters2.map((f) => f.cohort_id));
    expect(filters1.map((f) => f.cohort_id)).toEqual(filters3.map((f) => f.cohort_id));

    // Verify the order matches ascending UUID sort
    const expectedOrder = [cohortA.id, cohortB.id, cohortC.id].sort();
    expect(filters1.map((f) => f.cohort_id)).toEqual(expectedOrder);
  });
});

// ── IDOR: update() must enforce project_id in WHERE ──────────────────────────

describe('CohortsService.update — project_id isolation', () => {
  it('throws CohortNotFoundException when updating a cohort from a different project', async () => {
    // Create two separate projects
    const { projectId: projectA } = await createTestProject(ctx.db);
    const { projectId: projectB, userId: userB } = await createTestProject(ctx.db);

    // Create a cohort in projectA
    const cohort = await service.create(userB, projectA, {
      name: 'Cohort in Project A',
      definition: {
        type: 'AND',
        values: [
          { type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' },
        ],
      },
    });

    // Attempt to update it using projectB — should be rejected
    await expect(
      service.update(projectB, cohort.id, { name: 'Hacked Name' }),
    ).rejects.toThrow(CohortNotFoundException);

    // Verify cohort was NOT modified
    const unchanged = await service.getById(projectA, cohort.id);
    expect(unchanged.name).toBe('Cohort in Project A');
  });

  it('updates successfully when project_id matches', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const cohort = await service.create(userId, projectId, {
      name: 'Original Name',
      definition: {
        type: 'AND',
        values: [
          { type: 'person_property', property: 'plan', operator: 'eq', value: 'free' },
        ],
      },
    });

    const updated = await service.update(projectId, cohort.id, { name: 'Updated Name' });

    expect(updated.name).toBe('Updated Name');
  });

  it('throws CohortNotFoundException for a random cohortId in a valid project', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const nonExistentCohortId = randomUUID();

    await expect(
      service.update(projectId, nonExistentCohortId, { name: 'Ghost' }),
    ).rejects.toThrow(CohortNotFoundException);
  });
});

// ── getMemberCount: 3 code paths ──────────────────────────────────────────────

describe('CohortsService.getMemberCount', () => {
  it('static cohort → countStaticCohortMembers from person_static_cohort FINAL', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const personA = randomUUID();
    const personB = randomUUID();

    // Create a static cohort (no definition)
    const cohort = await service.create(userId, projectId, {
      name: 'Static Cohort',
      is_static: true,
    });

    // Insert members directly into person_static_cohort
    await insertStaticCohortMembers(ctx.ch, projectId, cohort.id, [personA, personB]);

    const count = await service.getMemberCount(projectId, cohort.id);
    expect(count).toBe(2);
  });

  it('materialized dynamic cohort (membership_version !== null) → countCohortMembersFromTable', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const personA = randomUUID();
    const personB = randomUUID();
    const personC = randomUUID();

    const definition = {
      type: 'AND' as const,
      values: [
        { type: 'person_property' as const, property: 'plan', operator: 'eq' as const, value: 'premium' },
      ],
    };

    const cohort = await service.create(userId, projectId, { name: 'Dynamic Materialized', definition });

    // Insert events for 2 premium persons + 1 free
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'pa', event_name: '$set', user_properties: JSON.stringify({ plan: 'premium' }), timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'pb', event_name: '$set', user_properties: JSON.stringify({ plan: 'premium' }), timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: personC, distinct_id: 'pc', event_name: '$set', user_properties: JSON.stringify({ plan: 'free' }), timestamp: msAgo(1000) }),
    ]);

    // Materialize the cohort (inserts into cohort_members)
    const version = await materializeCohort(ctx.ch, projectId, cohort.id, definition);

    // Update membership_version directly in DB to simulate cohort-worker completion
    const { cohorts } = await import('@qurvo/db');
    const { eq } = await import('drizzle-orm');
    await ctx.db.update(cohorts).set({ membership_version: version }).where(eq(cohorts.id, cohort.id));

    const count = await service.getMemberCount(projectId, cohort.id);
    expect(count).toBe(2); // personA + personB (premium), not personC (free)
  });

  it('non-materialized dynamic cohort (membership_version === null) → inline countCohortMembers', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const personA = randomUUID();
    const personB = randomUUID();

    const definition = {
      type: 'AND' as const,
      values: [
        { type: 'person_property' as const, property: 'role', operator: 'eq' as const, value: 'admin' },
      ],
    };

    const cohort = await service.create(userId, projectId, { name: 'Dynamic Non-Materialized', definition });

    // membership_version is null by default after create — inline count path
    expect(cohort.membership_version).toBeNull();

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'pa2', event_name: '$set', user_properties: JSON.stringify({ role: 'admin' }), timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'pb2', event_name: '$set', user_properties: JSON.stringify({ role: 'viewer' }), timestamp: msAgo(1000) }),
    ]);

    const count = await service.getMemberCount(projectId, cohort.id);
    expect(count).toBe(1); // only personA (admin)
  });
});

// ── countStaticCohortMembers: direct query (via getMemberCount on static cohort) ──

describe('CohortsService — countStaticCohortMembers direct', () => {
  it('returns the correct count directly from person_static_cohort', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const members = [randomUUID(), randomUUID(), randomUUID()];

    const cohort = await service.create(userId, projectId, {
      name: 'Direct Static Count Test',
      is_static: true,
    });

    await insertStaticCohortMembers(ctx.ch, projectId, cohort.id, members);

    // getMemberCount delegates to countStaticCohortMembers for static cohorts
    const count = await service.getMemberCount(projectId, cohort.id);
    expect(count).toBe(3);
  });

  it('returns 0 for a static cohort with no members', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const cohort = await service.create(userId, projectId, {
      name: 'Empty Static Cohort',
      is_static: true,
    });

    const count = await service.getMemberCount(projectId, cohort.id);
    expect(count).toBe(0);
  });
});

// ── remove(): ClickHouse cohort_members cleanup ───────────────────────────────

describe('CohortsService.remove — ClickHouse cleanup', () => {
  it('deletes cohort_members rows from ClickHouse after cohort removal', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const personA = randomUUID();
    const personB = randomUUID();

    const definition = {
      type: 'AND' as const,
      values: [
        { type: 'person_property' as const, property: 'plan', operator: 'eq' as const, value: 'pro' },
      ],
    };

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'rpa', event_name: '$set', user_properties: JSON.stringify({ plan: 'pro' }), timestamp: msAgo(2000) }),
      buildEvent({ project_id: projectId, person_id: personB, distinct_id: 'rpb', event_name: '$set', user_properties: JSON.stringify({ plan: 'pro' }), timestamp: msAgo(1000) }),
    ]);

    const cohort = await service.create(userId, projectId, { name: 'To Be Deleted', definition });

    // Materialize membership rows into cohort_members
    await materializeCohort(ctx.ch, projectId, cohort.id, definition);

    // Verify members exist before deletion
    const beforeResult = await ctx.ch.query({
      query: `SELECT count() AS cnt FROM cohort_members FINAL WHERE project_id = {project_id:UUID} AND cohort_id = {cohort_id:UUID}`,
      query_params: { project_id: projectId, cohort_id: cohort.id },
      format: 'JSONEachRow',
    });
    const beforeRows = await beforeResult.json<{ cnt: string }>();
    expect(Number(beforeRows[0].cnt)).toBeGreaterThan(0);

    // Remove the cohort — triggers fire-and-forget ClickHouse cleanup
    await service.remove(projectId, cohort.id);

    // Poll until the ClickHouse mutation completes (fire-and-forget)
    await pollUntil(async () => {
      const result = await ctx.ch.query({
        query: `SELECT count() AS cnt FROM cohort_members FINAL WHERE project_id = {project_id:UUID} AND cohort_id = {cohort_id:UUID}`,
        query_params: { project_id: projectId, cohort_id: cohort.id },
        format: 'JSONEachRow',
      });
      const rows = await result.json<{ cnt: string }>();
      return Number(rows[0].cnt) === 0;
    }, { timeout: 30_000, interval: 500 });

    // Final assertion: no rows remain in ClickHouse for deleted cohort
    const afterResult = await ctx.ch.query({
      query: `SELECT count() AS cnt FROM cohort_members FINAL WHERE project_id = {project_id:UUID} AND cohort_id = {cohort_id:UUID}`,
      query_params: { project_id: projectId, cohort_id: cohort.id },
      format: 'JSONEachRow',
    });
    const afterRows = await afterResult.json<{ cnt: string }>();
    expect(Number(afterRows[0].cnt)).toBe(0);
  });
});

// ── circular dependency detection (via CohortsService) ───────────────────────

describe('CohortsService — circular dependency detection', () => {
  it('update() throws AppBadRequestException when adding a definition creates a cycle (A → B → A)', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    // Create cohortA with a simple property filter
    const cohortA = await service.create(userId, projectId, {
      name: 'Cohort A (circular test)',
      definition: {
        type: 'AND',
        values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }],
      },
    });

    // Create cohortB that references cohortA (B → A)
    const cohortB = await service.create(userId, projectId, {
      name: 'Cohort B (references A)',
      definition: {
        type: 'AND',
        values: [{ type: 'cohort', cohort_id: cohortA.id, negated: false }],
      },
    });

    // Now update cohortA to reference cohortB — this would create A → B → A
    await expect(
      service.update(projectId, cohortA.id, {
        definition: {
          type: 'AND',
          values: [{ type: 'cohort', cohort_id: cohortB.id, negated: false }],
        },
      }),
    ).rejects.toThrow(AppBadRequestException);

    // cohortA definition must remain unchanged
    const unchanged = await service.getById(projectId, cohortA.id);
    expect(unchanged.definition).toEqual({
      type: 'AND',
      values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }],
    });
  });

  it('update() throws AppBadRequestException for a 3-level cycle (X → Y → Z → X)', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const cohortX = await service.create(userId, projectId, {
      name: 'Cohort X',
      definition: {
        type: 'AND',
        values: [{ type: 'person_property', property: 'tier', operator: 'eq', value: 'gold' }],
      },
    });

    const cohortY = await service.create(userId, projectId, {
      name: 'Cohort Y (references X)',
      definition: {
        type: 'AND',
        values: [{ type: 'cohort', cohort_id: cohortX.id, negated: false }],
      },
    });

    const cohortZ = await service.create(userId, projectId, {
      name: 'Cohort Z (references Y)',
      definition: {
        type: 'AND',
        values: [{ type: 'cohort', cohort_id: cohortY.id, negated: false }],
      },
    });

    // Update cohortX to reference cohortZ — would create X → Y → Z → X (3-level cycle)
    await expect(
      service.update(projectId, cohortX.id, {
        definition: {
          type: 'AND',
          values: [{ type: 'cohort', cohort_id: cohortZ.id, negated: false }],
        },
      }),
    ).rejects.toThrow(AppBadRequestException);
  });

  it('create() does not throw when definition references existing cohorts without cycles', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const base = await service.create(userId, projectId, {
      name: 'Base Cohort',
      definition: {
        type: 'AND',
        values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'pro' }],
      },
    });

    // create a new cohort referencing base — no cycle, should succeed
    const derived = await service.create(userId, projectId, {
      name: 'Derived Cohort (safe reference)',
      definition: {
        type: 'AND',
        values: [{ type: 'cohort', cohort_id: base.id, negated: false }],
      },
    });

    expect(derived).toBeDefined();
    expect(derived.id).not.toBe(base.id);
  });
});

// ── update(): definition change resets materialization fields ─────────────────

describe('CohortsService.update — definition change side effects', () => {
  it('resets membership_version, membership_computed_at, errors_calculating to null/0 when definition changes', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const cohort = await service.create(userId, projectId, {
      name: 'Materialized Cohort',
      definition: {
        type: 'AND',
        values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }],
      },
    });

    // Simulate cohort-worker having materialized the cohort
    const { cohorts } = await import('@qurvo/db');
    const { eq } = await import('drizzle-orm');
    const now = new Date();
    await ctx.db.update(cohorts).set({
      membership_version: 12345,
      membership_computed_at: now,
      errors_calculating: 3,
    }).where(eq(cohorts.id, cohort.id));

    // Verify the state before update
    const beforeUpdate = await service.getById(projectId, cohort.id);
    expect(beforeUpdate.membership_version).toBe(12345);
    expect(beforeUpdate.errors_calculating).toBe(3);

    // Update the definition — should reset materialization fields
    const updated = await service.update(projectId, cohort.id, {
      definition: {
        type: 'AND',
        values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'enterprise' }],
      },
    });

    expect(updated.membership_version).toBeNull();
    expect(updated.membership_computed_at).toBeNull();
    expect(updated.errors_calculating).toBe(0);
  });

  it('does NOT reset membership_version when only name changes (no definition)', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const cohort = await service.create(userId, projectId, {
      name: 'Named Cohort',
      definition: {
        type: 'AND',
        values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'plus' }],
      },
    });

    const { cohorts } = await import('@qurvo/db');
    const { eq } = await import('drizzle-orm');
    await ctx.db.update(cohorts).set({
      membership_version: 99,
      errors_calculating: 1,
    }).where(eq(cohorts.id, cohort.id));

    // Update only the name — membership fields must remain intact
    const updated = await service.update(projectId, cohort.id, { name: 'Renamed Cohort' });

    expect(updated.membership_version).toBe(99);
    expect(updated.errors_calculating).toBe(1);
    expect(updated.name).toBe('Renamed Cohort');
  });
});

// ── update(): cannot set definition on static cohort ─────────────────────────

describe('CohortsService.update — static cohort definition guard', () => {
  it('throws AppBadRequestException when trying to set definition on a static cohort', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const cohort = await service.create(userId, projectId, {
      name: 'My Static Cohort',
      is_static: true,
    });

    await expect(
      service.update(projectId, cohort.id, {
        definition: {
          type: 'AND',
          values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'premium' }],
        },
      }),
    ).rejects.toThrow(AppBadRequestException);
  });

  it('allows updating name on a static cohort without throwing', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const cohort = await service.create(userId, projectId, {
      name: 'Static Name Update Test',
      is_static: true,
    });

    const updated = await service.update(projectId, cohort.id, { name: 'New Static Name' });
    expect(updated.name).toBe('New Static Name');
    expect(updated.is_static).toBe(true);
  });
});

// ── resolveCohortFilters: non-existent cohortId ───────────────────────────────

describe('CohortsService.resolveCohortFilters — non-existent cohortId', () => {
  it('throws CohortNotFoundException when a cohortId does not exist', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const nonExistentId = randomUUID();

    await expect(
      service.resolveCohortFilters(projectId, [nonExistentId]),
    ).rejects.toThrow(CohortNotFoundException);
  });

  it('throws CohortNotFoundException when one of multiple cohortIds does not exist', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const cohort = await service.create(userId, projectId, {
      name: 'Existing',
      definition: {
        type: 'AND',
        values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'x' }],
      },
    });

    const nonExistentId = randomUUID();

    await expect(
      service.resolveCohortFilters(projectId, [cohort.id, nonExistentId]),
    ).rejects.toThrow(CohortNotFoundException);
  });
});

// ── membership_version in resolved cohort filters/breakdowns ─────────────────
// Verifies that resolveCohortFilters and resolveCohortBreakdowns include the
// current membership_version so analytics cache keys are invalidated after
// cohort-worker recomputes membership.

describe('CohortsService — membership_version propagation for cache invalidation', () => {
  it('resolveCohortFilters returns null membership_version for a fresh (non-materialized) cohort', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const cohort = await service.create(userId, projectId, {
      name: 'Inline cohort',
      definition: { type: 'AND', values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'pro' }] },
    });

    const filters = await service.resolveCohortFilters(projectId, [cohort.id]);

    expect(filters).toHaveLength(1);
    expect(filters[0].membership_version).toBeNull();
    expect(filters[0].materialized).toBe(false);
  });

  it('resolveCohortFilters returns current membership_version after materialization', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const cohort = await service.create(userId, projectId, {
      name: 'Materialized cohort',
      definition: { type: 'AND', values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'pro' }] },
    });

    const version1 = 1_700_000_000_000;

    // Simulate cohort-worker setting membership_version (markComputationSuccess)
    await ctx.db.update(cohorts)
      .set({ membership_version: version1, membership_computed_at: new Date() })
      .where(eq(cohorts.id, cohort.id));

    const filtersV1 = await service.resolveCohortFilters(projectId, [cohort.id]);

    expect(filtersV1[0].materialized).toBe(true);
    expect(filtersV1[0].membership_version).toBe(version1);

    // Simulate cohort-worker running another cycle (version bump)
    const version2 = 1_700_000_001_000;
    await ctx.db.update(cohorts)
      .set({ membership_version: version2, membership_computed_at: new Date() })
      .where(eq(cohorts.id, cohort.id));

    const filtersV2 = await service.resolveCohortFilters(projectId, [cohort.id]);

    expect(filtersV2[0].membership_version).toBe(version2);
    // Different version → stableStringify(params with filtersV1) !== stableStringify(params with filtersV2)
    expect(filtersV1[0].membership_version).not.toBe(filtersV2[0].membership_version);
  });

  it('resolveCohortBreakdowns returns membership_version for materialized cohort', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const cohort = await service.create(userId, projectId, {
      name: 'Breakdown cohort',
      definition: { type: 'AND', values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'pro' }] },
    });

    const version = 1_700_000_002_000;
    await ctx.db.update(cohorts)
      .set({ membership_version: version, membership_computed_at: new Date() })
      .where(eq(cohorts.id, cohort.id));

    const breakdowns = await service.resolveCohortBreakdowns(projectId, [cohort.id]);

    expect(breakdowns).toHaveLength(1);
    expect(breakdowns[0].materialized).toBe(true);
    expect(breakdowns[0].membership_version).toBe(version);
  });

  it('resolveCohortBreakdowns returns null membership_version for inline (non-materialized) cohort', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const cohort = await service.create(userId, projectId, {
      name: 'Inline breakdown cohort',
      definition: { type: 'AND', values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'free' }] },
    });

    const breakdowns = await service.resolveCohortBreakdowns(projectId, [cohort.id]);

    expect(breakdowns).toHaveLength(1);
    expect(breakdowns[0].materialized).toBe(false);
    expect(breakdowns[0].membership_version).toBeNull();
  });
});
