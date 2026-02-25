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

  readonly eventsReceived = {
    inc: (count: number) => {
      this.dogstatsd.increment('ingest.events_received_total', count);
    },
  };

  readonly eventsDropped = {
    inc: (labels: { reason: string }, count: number) => {
      this.dogstatsd.increment('ingest.events_dropped_total', count, { reason: labels.reason });
    },
  };

  readonly backpressureRejected = {
    inc: () => {
      this.dogstatsd.increment('ingest.backpressure_rejected_total');
    },
  };

  readonly rateLimited = {
    inc: () => {
      this.dogstatsd.increment('ingest.rate_limited_total');
    },
  };

  readonly quotaLimited = {
    inc: () => {
      this.dogstatsd.increment('ingest.quota_limited_total');
    },
  };

  readonly batchDuration = {
    startTimer: (): (() => void) => {
      const start = Date.now();
      return () => {
        const durationMs = Date.now() - start;
        this.dogstatsd.timing('ingest.batch_duration_ms', durationMs);
      };
    },
  };
}
