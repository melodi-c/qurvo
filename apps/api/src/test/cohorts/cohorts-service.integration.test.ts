import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestProject } from '@qurvo/testing';
import { eq } from 'drizzle-orm';
import { cohorts } from '@qurvo/db';
import { getTestContext, type ContainerContext } from '../context';
import { CohortsService } from '../../cohorts/cohorts.service';
import { CohortNotFoundException } from '../../cohorts/exceptions/cohort-not-found.exception';

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
