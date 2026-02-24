import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { dashboards, widgets, insights } from '@qurvo/db';
import type { WidgetLayout } from '@qurvo/db';
import { DRIZZLE } from '../providers/drizzle.provider';
import type { Database } from '@qurvo/db';
import { ProjectsService } from '../projects/projects.service';
import { InsufficientPermissionsException } from '../projects/exceptions/insufficient-permissions.exception';
import { DashboardNotFoundException } from './exceptions/dashboard-not-found.exception';
import { WidgetNotFoundException } from './exceptions/widget-not-found.exception';
import { buildConditionalUpdate } from '../utils/build-conditional-update';

@Injectable()
export class DashboardsService {
  private readonly logger = new Logger(DashboardsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly projectsService: ProjectsService,
  ) {}

  async list(userId: string, projectId: string) {
    await this.projectsService.getMembership(userId, projectId);
    return this.db
      .select()
      .from(dashboards)
      .where(eq(dashboards.project_id, projectId))
      .orderBy(dashboards.created_at);
  }

  async getById(userId: string, projectId: string, dashboardId: string) {
    await this.projectsService.getMembership(userId, projectId);
    const [dashboard] = await this.db
      .select()
      .from(dashboards)
      .where(and(eq(dashboards.id, dashboardId), eq(dashboards.project_id, projectId)))
      .limit(1);
    if (!dashboard) throw new DashboardNotFoundException();

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

    return {
      ...dashboard,
      widgets: widgetRows.map((row) => ({
        id: row.id,
        dashboard_id: row.dashboard_id,
        insight_id: row.insight_id,
        layout: row.layout,
        content: row.content,
        created_at: row.created_at,
        updated_at: row.updated_at,
        insight: row.insight,
      })),
    };
  }

  async create(userId: string, projectId: string, input: { name: string }) {
    await this.projectsService.getMembership(userId, projectId);
    const [dashboard] = await this.db
      .insert(dashboards)
      .values({ project_id: projectId, name: input.name, created_by: userId })
      .returning();
    this.logger.log({ dashboardId: dashboard.id, projectId, userId }, 'Dashboard created');
    return dashboard;
  }

  async update(userId: string, projectId: string, dashboardId: string, input: { name?: string }) {
    const membership = await this.projectsService.getMembership(userId, projectId);
    if (membership.role === 'viewer') throw new InsufficientPermissionsException();
    await this.assertDashboardExists(projectId, dashboardId);

    const [updated] = await this.db
      .update(dashboards)
      .set({ ...buildConditionalUpdate(input, ['name']), updated_at: new Date() })
      .where(eq(dashboards.id, dashboardId))
      .returning();
    this.logger.log({ dashboardId, projectId, userId }, 'Dashboard updated');
    return updated;
  }

  async remove(userId: string, projectId: string, dashboardId: string) {
    const membership = await this.projectsService.getMembership(userId, projectId);
    if (membership.role === 'viewer') throw new InsufficientPermissionsException();
    await this.assertDashboardExists(projectId, dashboardId);

    await this.db.delete(dashboards).where(eq(dashboards.id, dashboardId));
    this.logger.log({ dashboardId, projectId, userId }, 'Dashboard deleted');
    return { ok: true };
  }

  async addWidget(
    userId: string,
    projectId: string,
    dashboardId: string,
    input: { insight_id?: string; layout: WidgetLayout; content?: string },
  ) {
    const membership = await this.projectsService.getMembership(userId, projectId);
    if (membership.role === 'viewer') throw new InsufficientPermissionsException();
    await this.assertDashboardExists(projectId, dashboardId);

    const [widget] = await this.db
      .insert(widgets)
      .values({
        dashboard_id: dashboardId,
        insight_id: input.insight_id ?? null,
        layout: input.layout,
        content: input.content ?? null,
      })
      .returning();
    this.logger.log({ widgetId: widget.id, dashboardId, projectId, userId }, 'Widget added');
    return widget;
  }

  async updateWidget(
    userId: string,
    projectId: string,
    dashboardId: string,
    widgetId: string,
    input: { insight_id?: string; layout?: WidgetLayout; content?: string },
  ) {
    const membership = await this.projectsService.getMembership(userId, projectId);
    if (membership.role === 'viewer') throw new InsufficientPermissionsException();
    await this.assertDashboardAndWidgetExist(projectId, dashboardId, widgetId);

    const values: Record<string, unknown> = { updated_at: new Date(), ...buildConditionalUpdate(input, ['insight_id', 'layout', 'content']) };

    const [updated] = await this.db
      .update(widgets)
      .set(values)
      .where(eq(widgets.id, widgetId))
      .returning();
    this.logger.log({ widgetId, dashboardId, projectId, userId }, 'Widget updated');
    return updated;
  }

  async removeWidget(userId: string, projectId: string, dashboardId: string, widgetId: string) {
    const membership = await this.projectsService.getMembership(userId, projectId);
    if (membership.role === 'viewer') throw new InsufficientPermissionsException();
    await this.assertDashboardAndWidgetExist(projectId, dashboardId, widgetId);

    await this.db.delete(widgets).where(eq(widgets.id, widgetId));
    this.logger.log({ widgetId, dashboardId, projectId, userId }, 'Widget removed');
    return { ok: true };
  }

  private async assertDashboardExists(projectId: string, dashboardId: string) {
    const [row] = await this.db
      .select({ id: dashboards.id })
      .from(dashboards)
      .where(and(eq(dashboards.id, dashboardId), eq(dashboards.project_id, projectId)))
      .limit(1);
    if (!row) throw new DashboardNotFoundException();
  }

  private async assertDashboardAndWidgetExist(projectId: string, dashboardId: string, widgetId: string) {
    const [row] = await this.db
      .select({ widget_id: widgets.id })
      .from(widgets)
      .innerJoin(dashboards, eq(widgets.dashboard_id, dashboards.id))
      .where(and(
        eq(dashboards.id, dashboardId),
        eq(dashboards.project_id, projectId),
        eq(widgets.id, widgetId),
      ))
      .limit(1);
    if (!row) throw new WidgetNotFoundException();
  }
}
