import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Database } from '@qurvo/db';
import { DRIZZLE } from '@qurvo/nestjs-infra';
import { ScheduledJobsService } from './scheduled-jobs.service';

@Injectable()
export class ShutdownService implements OnApplicationShutdown {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectPinoLogger(ShutdownService.name) private readonly logger: PinoLogger,
    private readonly scheduledJobsService: ScheduledJobsService,
  ) {}

  async onApplicationShutdown() {
    await this.scheduledJobsService
      .stop()
      .catch((err) => this.logger.warn({ err }, 'ScheduledJobsService stop failed'));
    await this.db.$pool.end().catch((err: unknown) =>
      this.logger.warn({ err }, 'PostgreSQL pool close failed'),
    );
  }
}
