import { Injectable, Inject } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { DRIZZLE } from '../providers/drizzle.provider';
import { eventDefinitions, type Database } from '@qurvo/db';
import { ProjectsService } from '../projects/projects.service';

export interface EventDefinitionItem {
  event_name: string;
  id: string;
  description: string | null;
  tags: string[];
  verified: boolean;
  last_seen_at: string;
  updated_at: string;
}

@Injectable()
export class EventDefinitionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly projectsService: ProjectsService,
  ) {}

  async list(userId: string, projectId: string): Promise<EventDefinitionItem[]> {
    await this.projectsService.getMembership(userId, projectId);

    const rows = await this.db
      .select()
      .from(eventDefinitions)
      .where(eq(eventDefinitions.project_id, projectId))
      .orderBy(desc(eventDefinitions.last_seen_at));

    return rows.map((r) => ({
      event_name: r.event_name,
      id: r.id,
      description: r.description ?? null,
      tags: r.tags,
      verified: r.verified,
      last_seen_at: r.last_seen_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
    }));
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
