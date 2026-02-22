import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../providers/drizzle.provider';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { propertyDefinitions, type Database } from '@qurvo/db';
import { ProjectsService } from '../projects/projects.service';
import { queryPropertyNamesWithCount } from '../events/property-names-with-count.query';

export interface PropertyDefinitionItem {
  property_name: string;
  property_type: 'event' | 'person';
  count: number;
  id: string | null;
  description: string | null;
  tags: string[];
  verified: boolean;
  updated_at: string | null;
}

@Injectable()
export class PropertyDefinitionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    private readonly projectsService: ProjectsService,
  ) {}

  async list(userId: string, projectId: string, type?: 'event' | 'person', eventName?: string): Promise<PropertyDefinitionItem[]> {
    await this.projectsService.getMembership(userId, projectId);

    const [chRows, pgRows] = await Promise.all([
      queryPropertyNamesWithCount(this.ch, { project_id: projectId, event_name: eventName }),
      this.db
        .select()
        .from(propertyDefinitions)
        .where(eq(propertyDefinitions.project_id, projectId)),
    ]);

    const metaMap = new Map(
      pgRows.map((r) => [`${r.property_name}:${r.property_type}`, r]),
    );

    const items = chRows
      .filter((ch) => !type || ch.property_type === type)
      .map((ch) => {
        const meta = metaMap.get(`${ch.property_name}:${ch.property_type}`);
        return {
          property_name: ch.property_name,
          property_type: ch.property_type,
          count: ch.count,
          id: meta?.id ?? null,
          description: meta?.description ?? null,
          tags: meta?.tags ?? [],
          verified: meta?.verified ?? false,
          updated_at: meta?.updated_at?.toISOString() ?? null,
        };
      });

    return items;
  }

  async upsert(
    userId: string,
    projectId: string,
    propertyName: string,
    propertyType: 'event' | 'person',
    input: { description?: string; tags?: string[]; verified?: boolean },
  ) {
    await this.projectsService.getMembership(userId, projectId);

    const rows = await this.db
      .insert(propertyDefinitions)
      .values({
        project_id: projectId,
        property_name: propertyName,
        property_type: propertyType,
        description: input.description ?? null,
        tags: input.tags ?? [],
        verified: input.verified ?? false,
      })
      .onConflictDoUpdate({
        target: [propertyDefinitions.project_id, propertyDefinitions.property_name, propertyDefinitions.property_type],
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
