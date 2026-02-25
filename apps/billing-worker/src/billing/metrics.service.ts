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
      this.dogstatsd.increment('billing_worker.cycles_total');
    },
  };

  readonly projectsCheckedTotal = {
    inc: (count: number) => {
      this.dogstatsd.increment('billing_worker.projects_checked_total', count);
    },
  };

  readonly quotaLimitedCount = {
    set: (value: number) => {
      this.dogstatsd.gauge('billing_worker.quota_limited_count', value);
    },
  };

  readonly cycleDuration = {
    startTimer: (): (() => void) => {
      const start = Date.now();
      return () => {
        const durationMs = Date.now() - start;
        this.dogstatsd.timing('billing_worker.cycle_duration_ms', durationMs);
      };
    },
  };
}
