import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import type { Database } from '@qurvo/db';
import { CLICKHOUSE, DRIZZLE } from '@qurvo/nestjs-infra';
import { InsightDiscoveryService } from './insight-discovery.service';

@Injectable()
export class ShutdownService implements OnApplicationShutdown {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @InjectPinoLogger(ShutdownService.name) private readonly logger: PinoLogger,
    private readonly insightDiscoveryService: InsightDiscoveryService,
  ) {}

  async onApplicationShutdown() {
    await this.insightDiscoveryService
      .stop()
      .catch((err) => this.logger.warn({ err }, 'InsightDiscoveryService stop failed'));
    await this.ch.close().catch((err) =>
      this.logger.warn({ err }, 'ClickHouse close failed'),
    );
    await this.db.$pool.end().catch((err) =>
      this.logger.warn({ err }, 'PostgreSQL pool close failed'),
    );
  }
}
