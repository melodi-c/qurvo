import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import {
  type Database,
  eventDefinitions,
  propertyDefinitions,
  persons,
  personDistinctIds,
  dashboards,
  insights,
  widgets,
  cohorts,
  marketingChannels,
  adSpend,
} from '@qurvo/db';
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
  async seed(projectId: string, scenarioName: string, userId: string): Promise<void> {
    const scenario = this.scenarioRegistry.get(scenarioName);
    if (!scenario) {
      throw new NotFoundException(
        `Demo scenario '${scenarioName}' not found. Available: ${this.scenarioRegistry.list().join(', ') || 'none'}`,
      );
    }

    const {
      events,
      definitions,
      propertyDefinitions: propDefs,
      persons: personRows,
      personDistinctIds: distinctIdRows,
      dashboards: dashboardRows,
      insights: insightRows,
      widgets: widgetRows,
      cohorts: cohortRows,
      marketingChannels: channelRows,
      adSpend: adSpendRows,
    } = await scenario.generate(projectId);

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
            description: d.description,
            last_seen_at: now,
          })),
        )
        .onConflictDoUpdate({
          target: [eventDefinitions.project_id, eventDefinitions.event_name],
          set: { description: sql`excluded.description`, last_seen_at: sql`excluded.last_seen_at` },
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
            description: p.description,
            last_seen_at: now,
          })),
        )
        .onConflictDoUpdate({
          target: [propertyDefinitions.project_id, propertyDefinitions.property_name, propertyDefinitions.property_type],
          set: { description: sql`excluded.description`, last_seen_at: sql`excluded.last_seen_at` },
        });
    }

    // Upsert persons in Postgres
    if (personRows.length > 0) {
      const now = new Date();
      await this.db
        .insert(persons)
        .values(
          personRows.map((p) => ({
            id: p.id,
            project_id: projectId,
            properties: p.properties,
            created_at: now,
            updated_at: now,
          })),
        )
        .onConflictDoUpdate({
          target: [persons.id],
          set: {
            properties: sql`excluded.properties`,
            updated_at: sql`excluded.updated_at`,
          },
        });
    }

    // Upsert person distinct IDs in Postgres
    if (distinctIdRows.length > 0) {
      await this.db
        .insert(personDistinctIds)
        .values(
          distinctIdRows.map((d) => ({
            project_id: projectId,
            person_id: d.personId,
            distinct_id: d.distinctId,
          })),
        )
        .onConflictDoNothing();
    }

    // Insert dashboards
    if (dashboardRows.length > 0) {
      await this.db
        .insert(dashboards)
        .values(
          dashboardRows.map((d) => ({
            id: d.id,
            project_id: projectId,
            created_by: userId,
            name: d.name,
          })),
        )
        .onConflictDoNothing();
    }

    // Insert insights
    if (insightRows.length > 0) {
      await this.db
        .insert(insights)
        .values(
          insightRows.map((ins) => ({
            id: ins.id,
            project_id: projectId,
            created_by: userId,
            type: ins.type,
            name: ins.name,
            description: ins.description,
            config: ins.config,
            is_favorite: ins.is_favorite ?? false,
          })),
        )
        .onConflictDoNothing();
    }

    // Insert widgets
    if (widgetRows.length > 0) {
      await this.db
        .insert(widgets)
        .values(
          widgetRows.map((w) => ({
            dashboard_id: w.dashboardId,
            insight_id: w.insightId,
            layout: w.layout,
          })),
        )
        .onConflictDoNothing();
    }

    // Insert cohorts
    if (cohortRows.length > 0) {
      await this.db
        .insert(cohorts)
        .values(
          cohortRows.map((c) => ({
            id: c.id,
            project_id: projectId,
            created_by: userId,
            name: c.name,
            description: c.description,
            definition: c.definition,
            is_static: false,
          })),
        )
        .onConflictDoNothing();
    }

    // Insert marketing channels
    if (channelRows.length > 0) {
      await this.db
        .insert(marketingChannels)
        .values(
          channelRows.map((ch) => ({
            id: ch.id,
            project_id: projectId,
            created_by: userId,
            name: ch.name,
            channel_type: ch.channel_type,
            color: ch.color,
          })),
        )
        .onConflictDoNothing();
    }

    // Insert ad spend
    if (adSpendRows.length > 0) {
      await this.db
        .insert(adSpend)
        .values(
          adSpendRows.map((a) => ({
            project_id: projectId,
            channel_id: a.channelId,
            created_by: userId,
            spend_date: a.spend_date,
            amount: a.amount,
            currency: a.currency ?? 'USD',
          })),
        )
        .onConflictDoNothing();
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

    // Delete dashboards first — cascades to widgets (FK: widget.dashboard_id → dashboards.id cascade)
    // widgets.insight_id uses SET NULL on delete, so insights can be deleted independently
    await this.db
      .delete(dashboards)
      .where(eq(dashboards.project_id, projectId));

    // Delete insights (widgets.insight_id is already null or widgets are gone via cascade)
    await this.db
      .delete(insights)
      .where(eq(insights.project_id, projectId));

    // Delete cohorts
    await this.db
      .delete(cohorts)
      .where(eq(cohorts.project_id, projectId));

    // Delete ad spend before marketing channels (FK constraint)
    await this.db
      .delete(adSpend)
      .where(eq(adSpend.project_id, projectId));

    // Delete marketing channels
    await this.db
      .delete(marketingChannels)
      .where(eq(marketingChannels.project_id, projectId));

    // Delete event definitions from Postgres
    await this.db
      .delete(eventDefinitions)
      .where(eq(eventDefinitions.project_id, projectId));

    // Delete property definitions from Postgres
    await this.db
      .delete(propertyDefinitions)
      .where(eq(propertyDefinitions.project_id, projectId));

    // Delete person distinct IDs before persons (FK constraint)
    await this.db
      .delete(personDistinctIds)
      .where(eq(personDistinctIds.project_id, projectId));

    // Delete persons from Postgres
    await this.db
      .delete(persons)
      .where(eq(persons.project_id, projectId));

    this.logger.log(`Cleared demo data for project ${projectId}`);
  }

  /**
   * Clear all existing demo data and re-seed with the named scenario.
   * Returns the number of events seeded.
   */
  async reset(projectId: string, scenarioName: string, userId: string): Promise<{ count: number }> {
    await this.clear(projectId);
    const scenario = this.scenarioRegistry.get(scenarioName);
    if (!scenario) {
      throw new NotFoundException(
        `Demo scenario '${scenarioName}' not found. Available: ${this.scenarioRegistry.list().join(', ') || 'none'}`,
      );
    }
    const {
      events,
      definitions,
      propertyDefinitions: propDefs,
      persons: personRows,
      personDistinctIds: distinctIdRows,
      dashboards: dashboardRows,
      insights: insightRows,
      widgets: widgetRows,
      cohorts: cohortRows,
      marketingChannels: channelRows,
      adSpend: adSpendRows,
    } = await scenario.generate(projectId);

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
      this.logger.log(`Re-seeded ${events.length} events for project ${projectId} (scenario: ${scenarioName})`);
    }

    if (definitions.length > 0) {
      const now = new Date();
      await this.db
        .insert(eventDefinitions)
        .values(
          definitions.map((d) => ({
            project_id: projectId,
            event_name: d.eventName,
            description: d.description,
            last_seen_at: now,
          })),
        )
        .onConflictDoUpdate({
          target: [eventDefinitions.project_id, eventDefinitions.event_name],
          set: { description: sql`excluded.description`, last_seen_at: sql`excluded.last_seen_at` },
        });
    }

    if (propDefs.length > 0) {
      const now = new Date();
      await this.db
        .insert(propertyDefinitions)
        .values(
          propDefs.map((p) => ({
            project_id: projectId,
            property_name: p.propertyName,
            property_type: 'event' as const,
            description: p.description,
            last_seen_at: now,
          })),
        )
        .onConflictDoUpdate({
          target: [propertyDefinitions.project_id, propertyDefinitions.property_name, propertyDefinitions.property_type],
          set: { description: sql`excluded.description`, last_seen_at: sql`excluded.last_seen_at` },
        });
    }

    // Upsert persons in Postgres
    if (personRows.length > 0) {
      const now = new Date();
      await this.db
        .insert(persons)
        .values(
          personRows.map((p) => ({
            id: p.id,
            project_id: projectId,
            properties: p.properties,
            created_at: now,
            updated_at: now,
          })),
        )
        .onConflictDoUpdate({
          target: [persons.id],
          set: {
            properties: sql`excluded.properties`,
            updated_at: sql`excluded.updated_at`,
          },
        });
    }

    // Upsert person distinct IDs in Postgres
    if (distinctIdRows.length > 0) {
      await this.db
        .insert(personDistinctIds)
        .values(
          distinctIdRows.map((d) => ({
            project_id: projectId,
            person_id: d.personId,
            distinct_id: d.distinctId,
          })),
        )
        .onConflictDoNothing();
    }

    // Insert dashboards
    if (dashboardRows.length > 0) {
      await this.db
        .insert(dashboards)
        .values(
          dashboardRows.map((d) => ({
            id: d.id,
            project_id: projectId,
            created_by: userId,
            name: d.name,
          })),
        )
        .onConflictDoNothing();
    }

    // Insert insights
    if (insightRows.length > 0) {
      await this.db
        .insert(insights)
        .values(
          insightRows.map((ins) => ({
            id: ins.id,
            project_id: projectId,
            created_by: userId,
            type: ins.type,
            name: ins.name,
            description: ins.description,
            config: ins.config,
            is_favorite: ins.is_favorite ?? false,
          })),
        )
        .onConflictDoNothing();
    }

    // Insert widgets
    if (widgetRows.length > 0) {
      await this.db
        .insert(widgets)
        .values(
          widgetRows.map((w) => ({
            dashboard_id: w.dashboardId,
            insight_id: w.insightId,
            layout: w.layout,
          })),
        )
        .onConflictDoNothing();
    }

    // Insert cohorts
    if (cohortRows.length > 0) {
      await this.db
        .insert(cohorts)
        .values(
          cohortRows.map((c) => ({
            id: c.id,
            project_id: projectId,
            created_by: userId,
            name: c.name,
            description: c.description,
            definition: c.definition,
            is_static: false,
          })),
        )
        .onConflictDoNothing();
    }

    // Insert marketing channels
    if (channelRows.length > 0) {
      await this.db
        .insert(marketingChannels)
        .values(
          channelRows.map((ch) => ({
            id: ch.id,
            project_id: projectId,
            created_by: userId,
            name: ch.name,
            channel_type: ch.channel_type,
            color: ch.color,
          })),
        )
        .onConflictDoNothing();
    }

    // Insert ad spend
    if (adSpendRows.length > 0) {
      await this.db
        .insert(adSpend)
        .values(
          adSpendRows.map((a) => ({
            project_id: projectId,
            channel_id: a.channelId,
            created_by: userId,
            spend_date: a.spend_date,
            amount: a.amount,
            currency: a.currency ?? 'USD',
          })),
        )
        .onConflictDoNothing();
    }

    return { count: events.length };
  }
}
