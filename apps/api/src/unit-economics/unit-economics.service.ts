import { Injectable, Inject, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { eq } from 'drizzle-orm';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import { DRIZZLE } from '../providers/drizzle.provider';
import { REDIS } from '../providers/redis.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import type Redis from 'ioredis';
import { unitEconomicsConfig, type Database } from '@qurvo/db';
import { ProjectsService } from '../projects/projects.service';
import { AdSpendService } from '../ad-spend/ad-spend.service';
import { MarketingChannelsService } from '../marketing-channels/marketing-channels.service';
import { queryUnitEconomics, type UEGranularity, type UERawBucket } from './unit-economics.query';

const CACHE_TTL_SECONDS = 3600;

// ── Metrics type ──────────────────────────────────────────────────────────────

export interface UnitEconomicsMetrics {
  ua: number;
  c1: number;
  c2: number;
  apc: number;
  avp: number;
  arppu: number;
  arpu: number;
  churn_rate: number;
  lifetime_periods: number;
  ltv: number;
  cac: number;
  roi_percent: number;
  cm: number;
  total_revenue: number;
  total_purchases: number;
  paying_users: number;
  total_ad_spend: number;
}

export interface UEBucketResult {
  bucket: string;
  metrics: UnitEconomicsMetrics;
}

export interface UEResult {
  granularity: string;
  data: UEBucketResult[];
  totals: UnitEconomicsMetrics;
}

export interface UECacheEntry {
  data: UEResult;
  cached_at: string;
  from_cache: boolean;
}

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class UnitEconomicsService {
  private readonly logger = new Logger(UnitEconomicsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly projectsService: ProjectsService,
    private readonly adSpendService: AdSpendService,
    private readonly marketingChannelsService: MarketingChannelsService,
  ) {}

  // ── Config CRUD ────────────────────────────────────────────────────────────

  async getConfig(userId: string, projectId: string) {
    await this.projectsService.getMembership(userId, projectId);

    const rows = await this.db
      .select()
      .from(unitEconomicsConfig)
      .where(eq(unitEconomicsConfig.project_id, projectId));

    return rows[0] ?? null;
  }

  async upsertConfig(
    userId: string,
    projectId: string,
    input: {
      purchase_event_name?: string;
      revenue_property?: string;
      currency?: string;
      churn_window_days?: number;
    },
  ) {
    await this.projectsService.getMembership(userId, projectId);

    const existing = await this.db
      .select()
      .from(unitEconomicsConfig)
      .where(eq(unitEconomicsConfig.project_id, projectId));

    if (existing.length > 0) {
      const updateData: Record<string, unknown> = { updated_at: new Date() };
      if (input.purchase_event_name !== undefined) updateData.purchase_event_name = input.purchase_event_name;
      if (input.revenue_property !== undefined) updateData.revenue_property = input.revenue_property;
      if (input.currency !== undefined) updateData.currency = input.currency;
      if (input.churn_window_days !== undefined) updateData.churn_window_days = input.churn_window_days;

      const rows = await this.db
        .update(unitEconomicsConfig)
        .set(updateData)
        .where(eq(unitEconomicsConfig.project_id, projectId))
        .returning();

      return rows[0];
    }

    const rows = await this.db
      .insert(unitEconomicsConfig)
      .values({
        project_id: projectId,
        created_by: userId,
        purchase_event_name: input.purchase_event_name ?? null,
        revenue_property: input.revenue_property ?? 'revenue',
        currency: input.currency ?? 'USD',
        churn_window_days: input.churn_window_days ?? 30,
      })
      .returning();

    return rows[0];
  }

  // ── Metrics Engine ─────────────────────────────────────────────────────────

  async getMetrics(
    userId: string,
    params: {
      project_id: string;
      date_from: string;
      date_to: string;
      granularity: UEGranularity;
      purchase_event_name?: string;
      revenue_property?: string;
      churn_window_days?: number;
      channel_id?: string;
      widget_id?: string;
      force?: boolean;
    },
  ): Promise<UECacheEntry> {
    await this.projectsService.getMembership(userId, params.project_id);

    // Load config defaults
    const config = await this.getConfigInternal(params.project_id);
    const purchaseEvent = params.purchase_event_name ?? config?.purchase_event_name ?? 'purchase';
    const revenueProp = params.revenue_property ?? config?.revenue_property ?? 'revenue';
    const churnWindow = params.churn_window_days ?? config?.churn_window_days ?? 30;

    const { widget_id, force, ...rest } = params;
    const cacheKey = this.buildCacheKey(widget_id, { ...rest, purchaseEvent, revenueProp, churnWindow });

    if (!force) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.debug({ cacheKey }, 'UE cache hit');
        const entry = JSON.parse(cached) as { data: UEResult; cached_at: string };
        return { ...entry, from_cache: true };
      }
    }

    this.logger.debug(
      { projectId: params.project_id, granularity: params.granularity, force },
      'UE ClickHouse query',
    );

    // Load channel filter conditions if channel_id is provided
    let filterConditions: Array<{property: string; value: string}> | undefined;
    if (params.channel_id) {
      const channel = await this.marketingChannelsService.getById(userId, params.project_id, params.channel_id);
      filterConditions = (channel.filter_conditions as Array<{property: string; value: string}>) ?? undefined;
    }

    // Query ClickHouse for raw data
    const rawBuckets = await queryUnitEconomics(this.ch, {
      project_id: params.project_id,
      date_from: params.date_from,
      date_to: params.date_to,
      granularity: params.granularity,
      purchase_event_name: purchaseEvent,
      revenue_property: revenueProp,
      churn_window_days: churnWindow,
      filter_conditions: filterConditions,
    });

    // Get ad spend from PostgreSQL
    const totalAdSpend = await this.adSpendService.getTotalSpend(
      params.project_id,
      params.date_from,
      params.date_to,
    );

    // Compute metrics per bucket
    const bucketResults = rawBuckets.map((b) => ({
      bucket: b.bucket,
      metrics: this.computeMetrics(b, 0), // per-bucket has no CAC
    }));

    // Compute totals
    const totalsRaw = this.aggregateBuckets(rawBuckets);
    const totals = this.computeMetrics(totalsRaw, totalAdSpend);

    const data: UEResult = {
      granularity: params.granularity,
      data: bucketResults,
      totals,
    };

    const cached_at = new Date().toISOString();
    await this.redis.set(cacheKey, JSON.stringify({ data, cached_at }), 'EX', CACHE_TTL_SECONDS);

    return { data, cached_at, from_cache: false };
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  private async getConfigInternal(projectId: string) {
    const rows = await this.db
      .select()
      .from(unitEconomicsConfig)
      .where(eq(unitEconomicsConfig.project_id, projectId));
    return rows[0] ?? null;
  }

  private computeMetrics(raw: UERawBucket, adSpend: number): UnitEconomicsMetrics {
    const ua = raw.new_users;
    const totalUsers = raw.total_users || 1; // avoid /0
    const payingUsers = raw.paying_users;
    const usersWithRepeat = raw.users_with_repeat;
    const totalPurchases = raw.total_purchases;
    const totalRevenue = raw.total_revenue;
    const prevActive = raw.prev_active_users;
    const churned = raw.churned_users;

    // C1: conversion to first purchase
    const c1 = totalUsers > 0 ? payingUsers / totalUsers : 0;

    // C2: repeat purchase rate
    const c2 = payingUsers > 0 ? usersWithRepeat / payingUsers : 0;

    // APC: average purchases per customer
    let apc: number;
    if (c2 >= 1) {
      // All customers repeat — use direct calculation
      apc = payingUsers > 0 ? totalPurchases / payingUsers : 0;
    } else {
      apc = c2 > 0 ? 1 / (1 - c2) : (payingUsers > 0 ? 1 : 0);
    }

    // AVP: average purchase value
    const avp = totalPurchases > 0 ? totalRevenue / totalPurchases : 0;

    // ARPPU: average revenue per paying user
    const arppu = avp * apc;

    // ARPU: average revenue per user
    const arpu = arppu * c1;

    // Churn rate
    const churnRate = prevActive > 0 ? churned / prevActive : 0;

    // Lifetime (in periods)
    const lifetimePeriods = churnRate > 0 ? 1 / churnRate : 0;

    // LTV
    const ltv = arpu * lifetimePeriods;

    // CAC
    const cac = ua > 0 ? adSpend / ua : 0;

    // ROI
    const roiPercent = cac > 0 ? ((ltv - cac) / cac) * 100 : 0;

    // CM (Contribution Margin)
    const cm = ltv - cac;

    return {
      ua,
      c1: round4(c1),
      c2: round4(c2),
      apc: round2(apc),
      avp: round2(avp),
      arppu: round2(arppu),
      arpu: round2(arpu),
      churn_rate: round4(churnRate),
      lifetime_periods: round2(lifetimePeriods),
      ltv: round2(ltv),
      cac: round2(cac),
      roi_percent: round2(roiPercent),
      cm: round2(cm),
      total_revenue: round2(totalRevenue),
      total_purchases: totalPurchases,
      paying_users: payingUsers,
      total_ad_spend: round2(adSpend),
    };
  }

  private aggregateBuckets(buckets: UERawBucket[]): UERawBucket {
    return {
      bucket: 'total',
      new_users: buckets.reduce((s, b) => s + b.new_users, 0),
      total_users: buckets.reduce((s, b) => s + b.total_users, 0),
      paying_users: buckets.reduce((s, b) => s + b.paying_users, 0),
      users_with_repeat: buckets.reduce((s, b) => s + b.users_with_repeat, 0),
      total_purchases: buckets.reduce((s, b) => s + b.total_purchases, 0),
      total_revenue: buckets.reduce((s, b) => s + b.total_revenue, 0),
      prev_active_users: buckets.reduce((s, b) => s + b.prev_active_users, 0),
      churned_users: buckets.reduce((s, b) => s + b.churned_users, 0),
    };
  }

  private buildCacheKey(widgetId: string | undefined, params: unknown): string {
    const configHash = createHash('sha256')
      .update(JSON.stringify(params))
      .digest('hex')
      .slice(0, 16);
    return widgetId
      ? `ue_result:${widgetId}:${configHash}`
      : `ue_result:anonymous:${configHash}`;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
