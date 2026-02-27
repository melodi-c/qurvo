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
