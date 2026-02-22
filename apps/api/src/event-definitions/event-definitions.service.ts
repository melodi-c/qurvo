import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../providers/drizzle.provider';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { eventDefinitions, type Database } from '@qurvo/db';
import { ProjectsService } from '../projects/projects.service';
import { queryEventNamesWithCount } from '../events/event-names.query';

export interface EventDefinitionItem {
  event_name: string;
  count: number;
  id: string | null;
  description: string | null;
  tags: string[];
  verified: boolean;
  updated_at: string | null;
}

@Injectable()
export class EventDefinitionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    private readonly projectsService: ProjectsService,
  ) {}

  async list(userId: string, projectId: string): Promise<EventDefinitionItem[]> {
    await this.projectsService.getMembership(userId, projectId);

    const [chRows, pgRows] = await Promise.all([
      queryEventNamesWithCount(this.ch, { project_id: projectId }),
      this.db
        .select()
        .from(eventDefinitions)
        .where(eq(eventDefinitions.project_id, projectId)),
    ]);

    const metaMap = new Map(pgRows.map((r) => [r.event_name, r]));

    return chRows.map((ch) => {
      const meta = metaMap.get(ch.event_name);
      return {
        event_name: ch.event_name,
        count: ch.count,
        id: meta?.id ?? null,
        description: meta?.description ?? null,
        tags: meta?.tags ?? [],
        verified: meta?.verified ?? false,
        updated_at: meta?.updated_at?.toISOString() ?? null,
      };
    });
  }

  async upsert(
    userId: string,
    projectId: string,
    eventName: string,
    input: { description?: string; tags?: string[]; verified?: boolean },
  ) {
    await this.projectsService.getMembership(userId, projectId);

    const rows = await this.db
      .insert(eventDefinitions)
      .values({
        project_id: projectId,
        event_name: eventName,
        description: input.description ?? null,
        tags: input.tags ?? [],
        verified: input.verified ?? false,
      })
      .onConflictDoUpdate({
        target: [eventDefinitions.project_id, eventDefinitions.event_name],
        set: {
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.tags !== undefined ? { tags: input.tags } : {}),
          ...(input.verified !== undefined ? { verified: input.verified } : {}),
          updated_at: new Date(),
        },
      })
      .returning();

    return rows[0];
  }
}
