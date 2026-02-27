import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestProject } from '@qurvo/testing';
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
