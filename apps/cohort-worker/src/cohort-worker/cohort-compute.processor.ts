import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Job } from 'bullmq';
import type { CohortConditionGroup } from '@qurvo/db';
import { COHORT_COMPUTE_QUEUE, COHORT_COMPUTE_CONCURRENCY } from '../constants';
import { CohortComputationService } from './cohort-computation.service';
import { MetricsService } from './metrics.service';

export interface ComputeJobData {
  cohortId: string;
  projectId: string;
  definition: CohortConditionGroup;
}

export interface ComputeJobResult {
  cohortId: string;
  version?: number;
  success: boolean;
  pgFailed: boolean;
}

@Processor(COHORT_COMPUTE_QUEUE, { concurrency: COHORT_COMPUTE_CONCURRENCY })
export class CohortComputeProcessor extends WorkerHost {
  constructor(
    private readonly computation: CohortComputationService,
    @InjectPinoLogger(CohortComputeProcessor.name)
    private readonly logger: PinoLogger,
    private readonly metrics: MetricsService,
  ) {
    super();
  }

  async process(job: Job<ComputeJobData>): Promise<ComputeJobResult> {
    const startMs = Date.now();
    const { cohortId, projectId, definition } = job.data;

    try {
      const version = Date.now();
      await this.computation.computeMembership(cohortId, projectId, definition, version);

      const pgOk = await this.computation.markComputationSuccess(cohortId, version);
      if (pgOk) {
        await this.computation.recordSizeHistory(cohortId, projectId, version);
      }

      const durationMs = Date.now() - startMs;
      this.metrics.membersUpdatedTotal.inc(1);

      this.logger.info(
        { cohortId, projectId, version, pgOk, durationMs },
        'Computed cohort membership',
      );

      return { cohortId, version, success: true, pgFailed: !pgOk };
    } catch (err) {
      await this.computation.recordError(cohortId, err);
      const durationMs = Date.now() - startMs;
      this.metrics.errorsTotal.inc();

      this.logger.error(
        { err, cohortId, projectId, durationMs },
        'Failed to compute cohort membership',
      );
      return { cohortId, success: false, pgFailed: false };
    }
  }
}
