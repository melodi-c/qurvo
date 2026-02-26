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

  increment(metric: string, value?: number, tags?: Record<string, string>): void {
    this.dogstatsd.increment(metric, value ?? 1, tags);
  }

  gauge(metric: string, value: number, tags?: Record<string, string>): void {
    this.dogstatsd.gauge(metric, value, tags);
  }

  startTimer(metric: string, tags?: Record<string, string>): () => void {
    const start = Date.now();
    return () => {
      const durationMs = Date.now() - start;
      this.dogstatsd.timing(metric, durationMs, tags);
    };
  }
}
