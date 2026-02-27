import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestProject, insertTestEvents, buildEvent, msAgo, pollUntil, dateOffset } from '@qurvo/testing';
import { eq } from 'drizzle-orm';
import { cohorts } from '@qurvo/db';
import { getTestContext, type ContainerContext } from '../context';
import { CohortsService } from '../../cohorts/cohorts.service';
import { StaticCohortsService } from '../../cohorts/static-cohorts.service';
import { CohortNotFoundException } from '../../cohorts/exceptions/cohort-not-found.exception';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';
import { materializeCohort, insertStaticCohortMembers } from './helpers';
import { queryTrend } from '../../analytics/trend/trend.query';

let ctx: ContainerContext;
let service: CohortsService;
let staticService: StaticCohortsService;

beforeAll(async () => {
  ctx = await getTestContext();
  service = new CohortsService(ctx.db as any, ctx.ch as any, ctx.redis as any);
  staticService = new StaticCohortsService(ctx.db as any, ctx.ch as any, service);
}, 120_000);

// ── getByIds: preserves caller-supplied order ─────────────────────────────────

describe('CohortsService.resolveCohortFilters — input-order preservation', () => {
  it('returns cohorts in the same order as the caller-supplied cohortIds array', async () => {
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

    // Resolve in [C, A, B] order — result must match that exact order
    const filters = await service.resolveCohortFilters(projectId, [cohortC.id, cohortA.id, cohortB.id]);
    expect(filters.map((f) => f.cohort_id)).toEqual([cohortC.id, cohortA.id, cohortB.id]);
  });

  it('resolveCohortBreakdowns preserves caller-supplied order for breakdown label assignment', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const cohortX = await service.create(userId, projectId, {
      name: 'Cohort X',
      definition: { type: 'AND', values: [{ type: 'person_property', property: 'tier', operator: 'eq', value: 'x' }] },
    });
    const cohortY = await service.create(userId, projectId, {
      name: 'Cohort Y',
      definition: { type: 'AND', values: [{ type: 'person_property', property: 'tier', operator: 'eq', value: 'y' }] },
    });

    // Pass Y before X — breakdowns must reflect that order
    const breakdowns = await service.resolveCohortBreakdowns(projectId, [cohortY.id, cohortX.id]);
    expect(breakdowns.map((b) => b.cohort_id)).toEqual([cohortY.id, cohortX.id]);
  });
});

// ── create(): is_static=true ignores caller-supplied definition ───────────────

describe('CohortsService.create — static cohort definition override', () => {
  it('stores sentinel empty definition when is_static=true even if a definition is supplied', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const suppliedDefinition = {
      type: 'AND' as const,
      values: [{ type: 'person_property' as const, property: 'plan', operator: 'eq' as const, value: 'premium' }],
    };

    const cohort = await service.create(userId, projectId, {
      name: 'Static With Definition',
      is_static: true,
      definition: suppliedDefinition,
    });

    // The stored definition must be the sentinel, NOT the caller-supplied one
    expect(cohort.definition).toEqual({ type: 'AND', values: [] });
    expect(cohort.is_static).toBe(true);

    // Verify from DB as well
    const fromDb = await service.getById(projectId, cohort.id);
    expect(fromDb.definition).toEqual({ type: 'AND', values: [] });
  });

  it('stores sentinel empty definition when is_static=true and no definition is supplied', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const cohort = await service.create(userId, projectId, {
      name: 'Static No Definition',
      is_static: true,
    });

    expect(cohort.definition).toEqual({ type: 'AND', values: [] });
    expect(cohort.is_static).toBe(true);
  });
});

// ── duplicateAsStatic(): throws 400 for un-materialized dynamic cohort ────────

describe('StaticCohortsService.duplicateAsStatic — non-materialized guard', () => {
  it('throws AppBadRequestException when source dynamic cohort has membership_version === null', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const dynamic = await service.create(userId, projectId, {
      name: 'Un-materialized Dynamic',
      definition: { type: 'AND', values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'pro' }] },
    });

    // membership_version is null by default — cohort-worker has not run yet
    expect(dynamic.membership_version).toBeNull();

    await expect(
      staticService.duplicateAsStatic(userId, projectId, dynamic.id),
    ).rejects.toThrow(AppBadRequestException);

    await expect(
      staticService.duplicateAsStatic(userId, projectId, dynamic.id),
    ).rejects.toThrow('Cohort has not been computed yet');
  });

  it('succeeds when source dynamic cohort has been materialized', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const personA = randomUUID();

    const definition = {
      type: 'AND' as const,
      values: [{ type: 'person_property' as const, property: 'plan', operator: 'eq' as const, value: 'enterprise' }],
    };

    const dynamic = await service.create(userId, projectId, { name: 'Materialized Dynamic', definition });

    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: personA, distinct_id: 'pa', event_name: '$set', user_properties: JSON.stringify({ plan: 'enterprise' }), timestamp: msAgo(1000) }),
    ]);

    // Materialize membership
    const version = await materializeCohort(ctx.ch, projectId, dynamic.id, definition);
    await ctx.db.update(cohorts).set({ membership_version: version }).where(eq(cohorts.id, dynamic.id));

    // Now duplication should succeed
    const staticCopy = await staticService.duplicateAsStatic(userId, projectId, dynamic.id);

    expect(staticCopy).toBeDefined();
    expect(staticCopy.is_static).toBe(true);
    expect(staticCopy.name).toBe('Materialized Dynamic (static copy)');
  });

  it('allows duplicating a static cohort (always has no membership_version concept)', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const personA = randomUUID();

    // Create + populate a static cohort
    const staticSrc = await service.create(userId, projectId, {
      name: 'Source Static',
      is_static: true,
    });
    await insertStaticCohortMembers(ctx.ch, projectId, staticSrc.id, [personA]);

    // Duplicating a static cohort must not throw even though membership_version is null
    const copy = await staticService.duplicateAsStatic(userId, projectId, staticSrc.id);
    expect(copy.is_static).toBe(true);
    expect(copy.name).toBe('Source Static (static copy)');
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

// ── CohortsService.list(): project isolation + created_at DESC order ──────────

describe('CohortsService.list — project isolation and ordering', () => {
  it('returns only cohorts belonging to the given project', async () => {
    const { projectId: projectA, userId } = await createTestProject(ctx.db);
    const { projectId: projectB } = await createTestProject(ctx.db);

    // Create cohorts in both projects
    const cohortInA = await service.create(userId, projectA, {
      name: 'Cohort in Project A',
      definition: { type: 'AND', values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'pro' }] },
    });
    await service.create(userId, projectB, {
      name: 'Cohort in Project B',
      definition: { type: 'AND', values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'pro' }] },
    });

    const listA = await service.list(projectA);

    // Only projectA cohort is returned
    expect(listA.map((c) => c.id)).toContain(cohortInA.id);
    const projectIds = listA.map((c) => c.project_id);
    expect(projectIds.every((id) => id === projectA)).toBe(true);
  });

  it('returns cohorts ordered by created_at DESC (newest first)', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    // Create cohorts sequentially — created_at will differ by natural insert order
    const first = await service.create(userId, projectId, {
      name: 'First Cohort',
      definition: { type: 'AND', values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'a' }] },
    });
    const second = await service.create(userId, projectId, {
      name: 'Second Cohort',
      definition: { type: 'AND', values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'b' }] },
    });
    const third = await service.create(userId, projectId, {
      name: 'Third Cohort',
      definition: { type: 'AND', values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'c' }] },
    });

    const listed = await service.list(projectId);
    const ids = listed.map((c) => c.id);

    // Newest (third) should appear before older ones
    const indexFirst = ids.indexOf(first.id);
    const indexSecond = ids.indexOf(second.id);
    const indexThird = ids.indexOf(third.id);

    expect(indexThird).toBeLessThan(indexSecond);
    expect(indexSecond).toBeLessThan(indexFirst);
  });

  it('returns an empty array when the project has no cohorts', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const listed = await service.list(projectId);
    expect(listed).toEqual([]);
  });
});

// ── resolveCohortBreakdowns: enrichDefinition stamps is_static on nested cohort refs (issue #589) ──
// When a breakdown cohort's definition contains a nested { type: 'cohort' }
// reference to a static cohort, resolveCohortBreakdowns must call enrichDefinition
// so that is_static is stamped on the nested condition.  Without this stamp the
// ClickHouse cohort-ref handler defaults to cohort_members (empty for static
// cohorts) instead of person_static_cohort — producing an always-empty result.

describe('CohortsService.resolveCohortBreakdowns — enrichDefinition stamps is_static on nested cohort refs', () => {
  it('breakdown cohort referencing a nested static cohort returns non-empty results', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);
    const today = dateOffset(0);

    const premiumUser = randomUUID();
    const freeUser = randomUUID();

    // Insert events so that both users are visible in ClickHouse
    await insertTestEvents(ctx.ch, [
      buildEvent({ project_id: projectId, person_id: premiumUser, distinct_id: 'premium', event_name: 'page_view', user_properties: JSON.stringify({ plan: 'premium' }), timestamp: msAgo(3000) }),
      buildEvent({ project_id: projectId, person_id: freeUser, distinct_id: 'free', event_name: 'page_view', user_properties: JSON.stringify({ plan: 'free' }), timestamp: msAgo(3000) }),
    ]);

    // Create a static cohort and populate it with only the premium user
    const staticCohort = await service.create(userId, projectId, {
      name: 'Static Premium Members',
      is_static: true,
    });
    await insertStaticCohortMembers(ctx.ch, projectId, staticCohort.id, [premiumUser]);

    // Create a dynamic cohort whose definition is a nested ref to the static cohort.
    // Before the fix, resolveCohortBreakdowns would return this definition without
    // is_static stamped → cohort-ref handler reads cohort_members (empty) → 0 results.
    const breakdownCohort = await service.create(userId, projectId, {
      name: 'Dynamic referencing static',
      definition: {
        type: 'AND',
        values: [{ type: 'cohort', cohort_id: staticCohort.id, negated: false }],
      },
    });

    // Resolve breakdowns via the service under test
    const breakdowns = await service.resolveCohortBreakdowns(projectId, [breakdownCohort.id]);

    expect(breakdowns).toHaveLength(1);

    // The nested cohort condition must have is_static=true stamped by enrichDefinition
    const nestedCondition = breakdowns[0].definition.values[0] as { type: string; cohort_id: string; is_static?: boolean };
    expect(nestedCondition.type).toBe('cohort');
    expect(nestedCondition.cohort_id).toBe(staticCohort.id);
    expect(nestedCondition.is_static).toBe(true);

    // Also verify end-to-end: the breakdown must produce a non-empty trend result
    // for premiumUser only (the sole member of the static cohort).
    const result = await queryTrend(ctx.ch, {
      project_id: projectId,
      series: [{ event_name: 'page_view', label: 'Views' }],
      metric: 'total_events',
      granularity: 'day',
      date_from: today,
      date_to: today,
      breakdown_cohort_ids: breakdowns,
    });

    const r = result as Extract<typeof result, { compare: false; breakdown: true }>;
    const series = r.series.find((s) => s.breakdown_value === breakdownCohort.id);
    expect(series).toBeDefined();
    // Only premiumUser is in the static cohort → exactly 1 event in this series
    expect(series!.data[0]?.value).toBe(1);
  });

  it('resolveCohortBreakdowns: is_static=false is NOT stamped for dynamic nested cohort refs', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    // Create a plain dynamic cohort
    const innerDynamic = await service.create(userId, projectId, {
      name: 'Inner Dynamic',
      definition: {
        type: 'AND',
        values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'pro' }],
      },
    });

    // Create outer cohort referencing the inner dynamic cohort
    const outerCohort = await service.create(userId, projectId, {
      name: 'Outer referencing inner dynamic',
      definition: {
        type: 'AND',
        values: [{ type: 'cohort', cohort_id: innerDynamic.id, negated: false }],
      },
    });

    const breakdowns = await service.resolveCohortBreakdowns(projectId, [outerCohort.id]);

    expect(breakdowns).toHaveLength(1);

    const nestedCondition = breakdowns[0].definition.values[0] as { type: string; cohort_id: string; is_static?: boolean };
    expect(nestedCondition.type).toBe('cohort');
    expect(nestedCondition.cohort_id).toBe(innerDynamic.id);
    // Dynamic cohort → is_static must be false (not true)
    expect(nestedCondition.is_static).toBe(false);
  });
});

// ── CohortsService.getSizeHistory(): throws CohortNotFoundException for unknown cohortId ──

describe('CohortsService.getSizeHistory — non-existent cohortId', () => {
  it('throws CohortNotFoundException when cohortId does not exist in the project', async () => {
    const { projectId } = await createTestProject(ctx.db);
    const nonExistentId = randomUUID();

    await expect(
      service.getSizeHistory(projectId, nonExistentId),
    ).rejects.toThrow(CohortNotFoundException);
  });

  it('throws CohortNotFoundException when cohortId belongs to a different project', async () => {
    const { projectId: projectA, userId } = await createTestProject(ctx.db);
    const { projectId: projectB } = await createTestProject(ctx.db);

    const cohort = await service.create(userId, projectA, {
      name: 'Cohort in A',
      definition: { type: 'AND', values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'pro' }] },
    });

    // Requesting history for projectA cohort from projectB scope
    await expect(
      service.getSizeHistory(projectB, cohort.id),
    ).rejects.toThrow(CohortNotFoundException);
  });
});

// ── Cache invalidation on cohort update ──────────────────────────────────────

describe('CohortsService.update — analytics cache invalidation', () => {
  it('deletes all analytics:{projectId}:* keys from Redis after update()', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const cohort = await service.create(userId, projectId, {
      name: 'Cache Invalidation Test Cohort',
      definition: {
        type: 'AND',
        values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'pro' }],
      },
    });

    // Manually write two fake analytics cache entries for this project
    // to simulate cached trend / funnel results.
    const keyA = `analytics:${projectId}:trend_result:anonymous:abcd1234abcd1234`;
    const keyB = `analytics:${projectId}:funnel_result:widget-uuid:5678567856785678`;
    // Also write a key for a different project to verify isolation
    const otherProjectId = randomUUID();
    const keyOther = `analytics:${otherProjectId}:trend_result:anonymous:ffffffffffffffff`;

    await ctx.redis.set(keyA, '{"data":[],"cached_at":"2025-01-01T00:00:00.000Z"}', 'EX', 3600);
    await ctx.redis.set(keyB, '{"data":[],"cached_at":"2025-01-01T00:00:00.000Z"}', 'EX', 3600);
    await ctx.redis.set(keyOther, '{"data":[],"cached_at":"2025-01-01T00:00:00.000Z"}', 'EX', 3600);

    // Trigger update — fire-and-forget invalidation runs in background
    await service.update(projectId, cohort.id, {
      definition: {
        type: 'AND',
        values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: 'enterprise' }],
      },
    });

    // Wait briefly for the fire-and-forget SCAN+DEL to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    const afterA = await ctx.redis.exists(keyA);
    const afterB = await ctx.redis.exists(keyB);
    const afterOther = await ctx.redis.exists(keyOther);

    expect(afterA).toBe(0); // deleted
    expect(afterB).toBe(0); // deleted
    expect(afterOther).toBe(1); // untouched — different project
  });

  it('does not delete any keys when there are no cached analytics entries for the project', async () => {
    const { projectId, userId } = await createTestProject(ctx.db);

    const cohort = await service.create(userId, projectId, {
      name: 'No Cache Cohort',
      definition: {
        type: 'AND',
        values: [{ type: 'person_property', property: 'tier', operator: 'eq', value: 'basic' }],
      },
    });

    // No cache entries seeded — update should not throw
    await expect(
      service.update(projectId, cohort.id, {
        name: 'No Cache Cohort (renamed)',
      }),
    ).resolves.not.toThrow();
  });
});
