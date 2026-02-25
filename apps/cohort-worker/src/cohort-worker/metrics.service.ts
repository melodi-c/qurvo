import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import StatsD from 'hot-shots';

@Injectable()
export class MetricsService implements OnApplicationShutdown {
  private readonly dogstatsd: InstanceType<typeof StatsD>;

  constructor(
    @InjectPinoLogger(MetricsService.name) private readonly logger: PinoLogger,
  ) {
    this.dogstatsd = new StatsD({
      host: process.env.DD_AGENT_HOST || 'localhost',
      port: 8125,
      prefix: 'qurvo.',
      errorHandler: (err) => this.logger.warn({ err: err.message }, 'DogStatsD error'),
    });
  }

  onApplicationShutdown() {
    this.dogstatsd.close();
  }

  readonly cyclesTotal = {
    inc: () => {
      this.dogstatsd.increment('cohort_worker.cycles_total');
    },
  };

  readonly computedTotal = {
    inc: (count: number) => {
      this.dogstatsd.increment('cohort_worker.computed_total', count);
    },
  };

  readonly errorsTotal = {
    inc: () => {
      this.dogstatsd.increment('cohort_worker.errors_total');
    },
  };

  readonly membersUpdatedTotal = {
    inc: (count: number) => {
      this.dogstatsd.increment('cohort_worker.members_updated_total', count);
    },
  };

  readonly cycleDurationMs = {
    startTimer: (): (() => void) => {
      const start = Date.now();
      return () => {
        const durationMs = Date.now() - start;
        this.dogstatsd.timing('cohort_worker.cycle_duration_ms', durationMs);
      };
    },
  };

  readonly backoffSkippedTotal = {
    inc: (count: number) => {
      this.dogstatsd.increment('cohort_worker.backoff_skipped_total', count);
    },
  };
}
