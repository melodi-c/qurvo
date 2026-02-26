import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Database } from '@qurvo/db';
import { DRIZZLE } from '@qurvo/nestjs-infra';
import { MonitorService } from './monitor.service';

@Injectable()
export class ShutdownService implements OnApplicationShutdown {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectPinoLogger(ShutdownService.name) private readonly logger: PinoLogger,
    private readonly monitorService: MonitorService,
  ) {}

  async onApplicationShutdown() {
    await this.monitorService
      .stop()
      .catch((err) => this.logger.warn({ err }, 'MonitorService stop failed'));
    await this.db.$pool.end().catch((err) =>
      this.logger.warn({ err }, 'PostgreSQL pool close failed'),
    );
  }
}
