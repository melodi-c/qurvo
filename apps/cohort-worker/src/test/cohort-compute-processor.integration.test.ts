import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import type { INestApplicationContext } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  insertTestEvents,
  buildEvent,
  ts,
  type ContainerContext,
  type TestProject,
} from '@qurvo/testing';
import type { Job } from 'bullmq';
import { cohorts, type CohortConditionGroup } from '@qurvo/db';
import { CLICKHOUSE } from '@qurvo/nestjs-infra';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { getTestContext } from './context';
import {
  CohortComputeProcessor,
  type ComputeJobData,
  type ComputeJobResult,
} from '../cohort-worker/cohort-compute.processor';
import { CohortComputationService } from '../cohort-worker/cohort-computation.service';

let ctx: ContainerContext;
let workerApp: INestApplicationContext;
let testProject: TestProject;
let processor: CohortComputeProcessor;
let computation: CohortComputationService;
let appCh: ClickHouseClient;

beforeAll(async () => {
  const tc = await getTestContext();
  ctx = tc.ctx;
  workerApp = tc.app;
  testProject = tc.testProject;
  processor = workerApp.get(CohortComputeProcessor);
  computation = workerApp.get(CohortComputationService);
  appCh = workerApp.get<ClickHouseClient>(CLICKHOUSE);
}, 120_000);

afterEach(() => {
  vi.restoreAllMocks();
});

/** Build a minimal fake Bull Job wrapping the given data. */
function makeJob(data: ComputeJobData): Job<ComputeJobData> {
  return { data } as Job<ComputeJobData>;
}

/** Simple property-match cohort definition. */
function planDefinition(planValue: string): CohortConditionGroup {
  return {
    type: 'AND',
    values: [{ type: 'person_property', property: 'plan', operator: 'eq', value: planValue }],
  };
}

/**
 * Insert a person event and a real cohort row in PG.
 * Returns cohortId and personId.
 */
async function setupCohortWithPerson(planValue: string): Promise<{ cohortId: string; personId: string }> {
  const projectId = testProject.projectId;
  const personId = randomUUID();
  const cohortId = randomUUID();

  await insertTestEvents(ctx.ch, [
    buildEvent({
      project_id: projectId,
      person_id: personId,
      distinct_id: `proc-${randomUUID()}`,
      event_name: 'page_view',
      user_properties: JSON.stringify({ plan: planValue }),
      timestamp: ts(1),
    }),
  ]);

  await ctx.db.insert(cohorts).values({
    id: cohortId,
    project_id: projectId,
    created_by: testProject.userId,
    name: `Processor test ${planValue}`,
    definition: planDefinition(planValue),
  });

  return { cohortId, personId };
}

describe('CohortComputeProcessor.process()', () => {
  it('happy path — success: true, pgFailed: false, version: N and recordSizeHistory is called', async () => {
    const planValue = `proc_happy_${randomUUID().slice(0, 8)}`;
    const { cohortId } = await setupCohortWithPerson(planValue);
    const projectId = testProject.projectId;

    const recordSizeHistorySpy = vi.spyOn(computation, 'recordSizeHistory');

    const result: ComputeJobResult = await processor.process(
      makeJob({ cohortId, projectId, definition: planDefinition(planValue) }),
    );

    // ComputeJobResult shape
    expect(result.cohortId).toBe(cohortId);
    expect(result.success).toBe(true);
    expect(result.pgFailed).toBe(false);
    expect(typeof result.version).toBe('number');
    expect(result.version).toBeGreaterThan(0);

    // recordSizeHistory must have been called with the exact version returned
    expect(recordSizeHistorySpy).toHaveBeenCalledOnce();
    expect(recordSizeHistorySpy).toHaveBeenCalledWith(cohortId, projectId, result.version);
  });

  it('pgFailed path — markComputationSuccess returns false → pgFailed: true, success: true, recordSizeHistory NOT called', async () => {
    const planValue = `proc_pgfail_${randomUUID().slice(0, 8)}`;
    const { cohortId } = await setupCohortWithPerson(planValue);
    const projectId = testProject.projectId;

    // Simulate stale write: PG rejects the version (e.g. newer version already stored)
    vi.spyOn(computation, 'markComputationSuccess').mockResolvedValue(false);
    const recordSizeHistorySpy = vi.spyOn(computation, 'recordSizeHistory');

    const result: ComputeJobResult = await processor.process(
      makeJob({ cohortId, projectId, definition: planDefinition(planValue) }),
    );

    // CH write succeeded → success is still true
    expect(result.success).toBe(true);
    // PG tracking did not persist → pgFailed is true
    expect(result.pgFailed).toBe(true);
    expect(result.cohortId).toBe(cohortId);

    // recordSizeHistory must NOT be called when pgOk = false
    expect(recordSizeHistorySpy).not.toHaveBeenCalled();
  });

  it('computeMembership throws — recordError is called, returns { success: false, pgFailed: false }', async () => {
    const cohortId = randomUUID();
    const projectId = testProject.projectId;
    const planValue = `proc_throw_${randomUUID().slice(0, 8)}`;

    const computeError = new Error('CH connection refused during test');
    vi.spyOn(computation, 'computeMembership').mockRejectedValue(computeError);
    const recordErrorSpy = vi.spyOn(computation, 'recordError');

    const result: ComputeJobResult = await processor.process(
      makeJob({ cohortId, projectId, definition: planDefinition(planValue) }),
    );

    // ComputeJobResult shape for error path
    expect(result.success).toBe(false);
    expect(result.pgFailed).toBe(false);
    expect(result.cohortId).toBe(cohortId);
    // version is absent on error path
    expect(result.version).toBeUndefined();

    // recordError must have been called with the thrown error
    expect(recordErrorSpy).toHaveBeenCalledOnce();
    expect(recordErrorSpy).toHaveBeenCalledWith(cohortId, computeError);
  });

  it('recordSizeHistory internal CH failure — error absorbed inside service, processor returns success: true', async () => {
    const planValue = `proc_sizeerr_${randomUUID().slice(0, 8)}`;
    const { cohortId } = await setupCohortWithPerson(planValue);
    const projectId = testProject.projectId;

    // Track how many times ch.command is called.
    // computeMembership calls ch.command once; recordSizeHistory calls it once.
    // We let the first call (computeMembership) through and fail the second (recordSizeHistory).
    let commandCallCount = 0;
    const originalCommand = appCh.command.bind(appCh);
    vi.spyOn(appCh, 'command').mockImplementation((...args: Parameters<ClickHouseClient['command']>) => {
      commandCallCount++;
      if (commandCallCount === 2) {
        // This is the recordSizeHistory INSERT — simulate CH failure
        return Promise.reject(new Error('CH history insert failed during test'));
      }
      return originalCommand(...args);
    });

    const result: ComputeJobResult = await processor.process(
      makeJob({ cohortId, projectId, definition: planDefinition(planValue) }),
    );

    // recordSizeHistory absorbs the CH error internally — processor still returns success: true
    expect(result.success).toBe(true);
    expect(result.pgFailed).toBe(false);
    expect(result.cohortId).toBe(cohortId);
  });

  it('version in result matches version passed to markComputationSuccess', async () => {
    const planValue = `proc_version_${randomUUID().slice(0, 8)}`;
    const { cohortId } = await setupCohortWithPerson(planValue);
    const projectId = testProject.projectId;

    const markSpy = vi.spyOn(computation, 'markComputationSuccess');

    const result: ComputeJobResult = await processor.process(
      makeJob({ cohortId, projectId, definition: planDefinition(planValue) }),
    );

    expect(result.success).toBe(true);
    expect(result.pgFailed).toBe(false);

    // version in result must match what was passed to markComputationSuccess
    expect(markSpy).toHaveBeenCalledOnce();
    const versionPassedToPg: number = markSpy.mock.calls[0][1];
    expect(result.version).toBe(versionPassedToPg);
  });
});
