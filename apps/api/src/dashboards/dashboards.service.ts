import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and, exists } from 'drizzle-orm';
import { dashboards, widgets, insights } from '@qurvo/db';
import type { WidgetLayout } from '@qurvo/db';
import { DRIZZLE } from '../providers/drizzle.provider';
import type { Database } from '@qurvo/db';
import { DashboardNotFoundException } from './exceptions/dashboard-not-found.exception';
import { WidgetNotFoundException } from './exceptions/widget-not-found.exception';
import { buildConditionalUpdate } from '../utils/build-conditional-update';

@Injectable()
export class DashboardsService {
  private readonly logger = new Logger(DashboardsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async list(projectId: string) {
    return this.db
      .select()
      .from(dashboards)
      .where(eq(dashboards.project_id, projectId))
      .orderBy(dashboards.created_at);
  }

  async getById(projectId: string, dashboardId: string) {
    const [dashboard] = await this.db
      .select()
      .from(dashboards)
      .where(and(eq(dashboards.id, dashboardId), eq(dashboards.project_id, projectId)))
      .limit(1);
    if (!dashboard) {throw new DashboardNotFoundException();}

    const widgetRows = await this.db
      .select({
        id: widgets.id,
        dashboard_id: widgets.dashboard_id,
        insight_id: widgets.insight_id,
        layout: widgets.layout,
        content: widgets.content,
        created_at: widgets.created_at,
        updated_at: widgets.updated_at,
        insight: insights,
      })
      .from(widgets)
      .leftJoin(insights, eq(widgets.insight_id, insights.id))
      .where(eq(widgets.dashboard_id, dashboardId))
      .orderBy(widgets.created_at);

    return { ...dashboard, widgets: widgetRows };
  }

  async create(userId: string, projectId: string, input: { name: string }) {
    const [dashboard] = await this.db
      .insert(dashboards)
      .values({ project_id: projectId, name: input.name, created_by: userId })
      .returning();
    this.logger.log({ dashboardId: dashboard.id, projectId, userId }, 'Dashboard created');
    return dashboard;
  }

  async update(projectId: string, dashboardId: string, input: { name?: string }) {
    const [updated] = await this.db
      .update(dashboards)
      .set({ ...buildConditionalUpdate(input, ['name']), updated_at: new Date() })
      .where(and(eq(dashboards.id, dashboardId), eq(dashboards.project_id, projectId)))
      .returning();
    if (!updated) {throw new DashboardNotFoundException();}
    this.logger.log({ dashboardId, projectId }, 'Dashboard updated');
    return updated;
  }

  async remove(projectId: string, dashboardId: string) {
    const [deleted] = await this.db
      .delete(dashboards)
      .where(and(eq(dashboards.id, dashboardId), eq(dashboards.project_id, projectId)))
      .returning({ id: dashboards.id });
    if (!deleted) {throw new DashboardNotFoundException();}
    this.logger.log({ dashboardId, projectId }, 'Dashboard deleted');
  }

  async addWidget(
    projectId: string,
    dashboardId: string,
    input: { insight_id?: string; layout: WidgetLayout; content?: string },
  ) {
    const [dashboard] = await this.db
      .select({ id: dashboards.id })
      .from(dashboards)
      .where(and(eq(dashboards.id, dashboardId), eq(dashboards.project_id, projectId)))
      .limit(1);
    if (!dashboard) {throw new DashboardNotFoundException();}

    const [widget] = await this.db
      .insert(widgets)
      .values({
        dashboard_id: dashboardId,
        insight_id: input.insight_id ?? null,
        layout: input.layout,
        content: input.content ?? null,
      })
      .returning();
    this.logger.log({ widgetId: widget.id, dashboardId, projectId }, 'Widget added');
    return widget;
  }

  async updateWidget(
    projectId: string,
    dashboardId: string,
    widgetId: string,
    input: { insight_id?: string; layout?: WidgetLayout; content?: string },
  ) {
    const dashboardSubquery = this.db
      .select({ id: dashboards.id })
      .from(dashboards)
      .where(and(eq(dashboards.id, dashboardId), eq(dashboards.project_id, projectId)));

    const [updated] = await this.db
      .update(widgets)
      .set({ updated_at: new Date(), ...buildConditionalUpdate(input, ['insight_id', 'layout', 'content']) })
      .where(and(eq(widgets.id, widgetId), eq(widgets.dashboard_id, dashboardId), exists(dashboardSubquery)))
      .returning();
    if (!updated) {throw new WidgetNotFoundException();}
    this.logger.log({ widgetId, dashboardId, projectId }, 'Widget updated');
    return updated;
  }

  async removeWidget(projectId: string, dashboardId: string, widgetId: string) {
    const dashboardSubquery = this.db
      .select({ id: dashboards.id })
      .from(dashboards)
      .where(and(eq(dashboards.id, dashboardId), eq(dashboards.project_id, projectId)));

    const [deleted] = await this.db
      .delete(widgets)
      .where(and(eq(widgets.id, widgetId), eq(widgets.dashboard_id, dashboardId), exists(dashboardSubquery)))
      .returning({ id: widgets.id });
    if (!deleted) {throw new WidgetNotFoundException();}
    this.logger.log({ widgetId, dashboardId, projectId }, 'Widget removed');
  }
}
