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

  readonly eventsProcessed = {
    inc: (count: number) => {
      this.dogstatsd.increment('processor.events_processed_total', count);
    },
  };

  readonly eventsFailed = {
    inc: (labels: { reason: string }, count: number) => {
      this.dogstatsd.increment('processor.events_failed_total', count, { reason: labels.reason });
    },
  };

  readonly flushDuration = {
    startTimer: (): (() => void) => {
      const start = Date.now();
      return () => {
        const durationMs = Date.now() - start;
        this.dogstatsd.timing('processor.batch_flush_duration_ms', durationMs);
      };
    },
  };

  readonly bufferSize = {
    set: (value: number) => {
      this.dogstatsd.gauge('processor.buffer_size', value);
    },
  };

  readonly personBatchQueueSize = {
    set: (value: number) => {
      this.dogstatsd.gauge('processor.person_batch_queue_size', value);
    },
  };

  readonly dlqSize = {
    set: (value: number) => {
      this.dogstatsd.gauge('processor.dlq_size', value);
    },
  };

  readonly consecutiveErrors = {
    set: (value: number) => {
      this.dogstatsd.gauge('processor.consecutive_errors', value);
    },
  };

  readonly pelSize = {
    set: (value: number) => {
      this.dogstatsd.gauge('processor.pel_size', value);
    },
  };
}
