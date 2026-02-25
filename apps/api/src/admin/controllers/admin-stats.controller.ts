import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import type { Database } from '@qurvo/db';
import { users, projects } from '@qurvo/db';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import type Redis from 'ioredis';
import { DRIZZLE } from '../../providers/drizzle.provider';
import { CLICKHOUSE } from '../../providers/clickhouse.provider';
import { REDIS } from '../../providers/redis.provider';
import { IsStaffGuard } from '../guards/is-staff.guard';
import { AdminStatsDto } from '../dto/admin.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(IsStaffGuard)
@Controller('admin')
export class AdminStatsController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get('stats')
  async getStats(): Promise<AdminStatsDto> {
    const [usersResult, projectsResult, chResult, streamDepth] = await Promise.all([
      this.db.select({ count: sql<string>`COUNT(*)` }).from(users),
      this.db.select({ count: sql<string>`COUNT(*)` }).from(projects),
      this.ch.query({ query: 'SELECT COUNT(*) AS count FROM events', format: 'JSONEachRow' }),
      this.redis.xlen('events:incoming'),
    ]);

    const chRows = await chResult.json<{ count: string }>();
    const totalEvents = chRows.length > 0 ? parseInt(chRows[0].count, 10) : 0;

    return {
      total_users: parseInt(usersResult[0].count, 10),
      total_projects: parseInt(projectsResult[0].count, 10),
      total_events: totalEvents,
      redis_stream_depth: streamDepth,
    } as any;
  }
}
