import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { type Database, eventDefinitions, propertyDefinitions } from '@qurvo/db';
import { DRIZZLE } from '../providers/drizzle.provider';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import { ScenarioRegistry } from './scenarios/scenario.registry';

@Injectable()
export class DemoSeedService {
  private readonly logger = new Logger(DemoSeedService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    private readonly scenarioRegistry: ScenarioRegistry,
  ) {}

  /**
   * Run the named scenario for a project, inserting demo events and definitions.
   */
  async seed(projectId: string, scenarioName: string): Promise<void> {
    const scenario = this.scenarioRegistry.get(scenarioName);
    if (!scenario) {
      throw new NotFoundException(
        `Demo scenario '${scenarioName}' not found. Available: ${this.scenarioRegistry.list().join(', ') || 'none'}`,
      );
    }

    const { events, definitions, propertyDefinitions: propDefs } = await scenario.generate(projectId);

    // Insert events directly into ClickHouse (bypassing Redis Stream)
    if (events.length > 0) {
      await this.ch.insert({
        table: 'events',
        values: events,
        format: 'JSONEachRow',
        clickhouse_settings: {
          async_insert: 0,
          wait_for_async_insert: 0,
        },
      });
      this.logger.log(`Seeded ${events.length} events for project ${projectId} (scenario: ${scenarioName})`);
    }

    // Upsert event definitions in Postgres
    if (definitions.length > 0) {
      const now = new Date();
      await this.db
        .insert(eventDefinitions)
        .values(
          definitions.map((d) => ({
            project_id: projectId,
            event_name: d.eventName,
            last_seen_at: now,
          })),
        )
        .onConflictDoUpdate({
          target: [eventDefinitions.project_id, eventDefinitions.event_name],
          set: { last_seen_at: sql`excluded.last_seen_at` },
        });
    }

    // Upsert property definitions in Postgres
    if (propDefs.length > 0) {
      const now = new Date();
      await this.db
        .insert(propertyDefinitions)
        .values(
          propDefs.map((p) => ({
            project_id: projectId,
            property_name: p.propertyName,
            property_type: 'event' as const,
            last_seen_at: now,
          })),
        )
        .onConflictDoUpdate({
          target: [propertyDefinitions.project_id, propertyDefinitions.property_name, propertyDefinitions.property_type],
          set: { last_seen_at: sql`excluded.last_seen_at` },
        });
    }
  }

  /**
   * Delete all demo events from ClickHouse and clear event/property definitions from Postgres
   * for the given project.
   */
  async clear(projectId: string): Promise<void> {
    // Delete events from ClickHouse
    await this.ch.command({
      query: `ALTER TABLE events DELETE WHERE project_id = {project_id:UUID}`,
      query_params: { project_id: projectId },
    });

    // Delete event definitions from Postgres
    await this.db
      .delete(eventDefinitions)
      .where(eq(eventDefinitions.project_id, projectId));

    // Delete property definitions from Postgres
    await this.db
      .delete(propertyDefinitions)
      .where(eq(propertyDefinitions.project_id, projectId));

    this.logger.log(`Cleared demo data for project ${projectId}`);
  }

  /**
   * Clear all existing demo data and re-seed with the named scenario.
   */
  async reset(projectId: string, scenarioName: string): Promise<void> {
    await this.clear(projectId);
    await this.seed(projectId, scenarioName);
  }
}
