import { IsString, IsOptional, MinLength, MaxLength, IsObject, IsNotEmpty, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FunnelStepDto, FunnelExclusionDto } from './funnel.dto';
import { TrendSeriesDto } from './trend.dto';
import { InsightDto } from './insights.dto';

// ── Shared ────────────────────────────────────────────────────────────────────

export class CreateDashboardDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;
}

export class UpdateDashboardDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @IsOptional()
  name?: string;
}

export class WidgetLayoutDto {
  @IsNotEmpty()
  x: number;

  @IsNotEmpty()
  y: number;

  @IsNotEmpty()
  w: number;

  @IsNotEmpty()
  h: number;
}

// ── Widget config DTOs (for oneOf discriminator) ──────────────────────────────

export class FunnelWidgetConfigDto {
  @ApiProperty({ enum: ['funnel'] })
  type: 'funnel';

  @ApiProperty({ type: [FunnelStepDto] })
  steps: FunnelStepDto[];

  conversion_window_days: number;
  @ApiPropertyOptional() conversion_window_value?: number;
  @ApiPropertyOptional({ enum: ['second', 'minute', 'hour', 'day', 'week', 'month'] }) conversion_window_unit?: 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month';
  date_from: string;
  date_to: string;
  @ApiPropertyOptional() breakdown_property?: string;
  @ApiPropertyOptional({ enum: ['property', 'cohort'] }) breakdown_type?: 'property' | 'cohort';
  @ApiPropertyOptional({ type: [String] }) breakdown_cohort_ids?: string[];
  @ApiPropertyOptional({ type: [String] }) cohort_ids?: string[];
  @ApiPropertyOptional({ enum: ['ordered', 'strict', 'unordered'] }) funnel_order_type?: 'ordered' | 'strict' | 'unordered';
  @ApiPropertyOptional() funnel_viz_type?: string;
  @ApiPropertyOptional({ enum: ['total', 'relative'] }) conversion_rate_display?: 'total' | 'relative';
  @ApiPropertyOptional({ type: [FunnelExclusionDto] }) exclusions?: FunnelExclusionDto[];
}

export class TrendFormulaDto {
  id: string;
  label: string;
  expression: string;
}

export class TrendWidgetConfigDto {
  @ApiProperty({ enum: ['trend'] })
  type: 'trend';

  @ApiProperty({ type: [TrendSeriesDto] })
  series: TrendSeriesDto[];

  @ApiProperty({ enum: ['total_events', 'unique_users', 'events_per_user', 'property_sum', 'property_avg', 'property_min', 'property_max'], enumName: 'TrendMetric' })
  metric: 'total_events' | 'unique_users' | 'events_per_user' | 'property_sum' | 'property_avg' | 'property_min' | 'property_max';

  @ApiPropertyOptional() metric_property?: string;

  @ApiProperty({ enum: ['hour', 'day', 'week', 'month'], enumName: 'TrendGranularity' })
  granularity: 'hour' | 'day' | 'week' | 'month';

  @ApiProperty({ enum: ['line', 'bar'], enumName: 'ChartType' })
  chart_type: 'line' | 'bar';

  date_from: string;
  date_to: string;
  @ApiPropertyOptional() breakdown_property?: string;
  compare: boolean;
  @ApiPropertyOptional({ type: [String] }) cohort_ids?: string[];
  @ApiPropertyOptional({ type: [TrendFormulaDto] }) formulas?: TrendFormulaDto[];
}

export class RetentionWidgetConfigDto {
  @ApiProperty({ enum: ['retention'] })
  type: 'retention';

  target_event: string;

  @ApiProperty({ enum: ['first_time', 'recurring'], enumName: 'RetentionType' })
  retention_type: 'first_time' | 'recurring';

  @ApiProperty({ enum: ['day', 'week', 'month'], enumName: 'Granularity' })
  granularity: 'day' | 'week' | 'month';

  periods: number;
  date_from: string;
  date_to: string;
  @ApiPropertyOptional({ type: [String] }) cohort_ids?: string[];
}

export class LifecycleWidgetConfigDto {
  @ApiProperty({ enum: ['lifecycle'] })
  type: 'lifecycle';

  target_event: string;

  @ApiProperty({ enum: ['day', 'week', 'month'], enumName: 'Granularity' })
  granularity: 'day' | 'week' | 'month';

  date_from: string;
  date_to: string;
  @ApiPropertyOptional({ type: [String] }) cohort_ids?: string[];
}

export class StickinessWidgetConfigDto {
  @ApiProperty({ enum: ['stickiness'] })
  type: 'stickiness';

  target_event: string;

  @ApiProperty({ enum: ['day', 'week', 'month'], enumName: 'Granularity' })
  granularity: 'day' | 'week' | 'month';

  date_from: string;
  date_to: string;
  @ApiPropertyOptional({ type: [String] }) cohort_ids?: string[];
}

export class PathCleaningRuleConfigDto {
  regex: string;
  alias: string;
}

export class WildcardGroupConfigDto {
  pattern: string;
  alias: string;
}

export class PathsWidgetConfigDto {
  @ApiProperty({ enum: ['paths'] })
  type: 'paths';

  date_from: string;
  date_to: string;
  step_limit: number;
  @ApiPropertyOptional() start_event?: string;
  @ApiPropertyOptional() end_event?: string;
  @ApiPropertyOptional({ type: [String] }) exclusions?: string[];
  @ApiPropertyOptional() min_persons?: number;
  @ApiPropertyOptional({ type: [PathCleaningRuleConfigDto] }) path_cleaning_rules?: PathCleaningRuleConfigDto[];
  @ApiPropertyOptional({ type: [WildcardGroupConfigDto] }) wildcard_groups?: WildcardGroupConfigDto[];
  @ApiPropertyOptional({ type: [String] }) cohort_ids?: string[];
}

// ── Create / Update Widget DTOs ─────────────────────────────────────────────

export class CreateWidgetDto {
  @IsUUID()
  @IsOptional()
  insight_id?: string;

  @IsObject()
  @Type(() => WidgetLayoutDto)
  layout: WidgetLayoutDto;

  @IsString()
  @IsOptional()
  @MaxLength(10000)
  @ApiPropertyOptional()
  content?: string;
}

export class UpdateWidgetDto {
  @IsUUID()
  @IsOptional()
  insight_id?: string;

  @IsObject()
  @IsOptional()
  @Type(() => WidgetLayoutDto)
  layout?: WidgetLayoutDto;

  @IsString()
  @IsOptional()
  @MaxLength(10000)
  @ApiPropertyOptional()
  content?: string;
}

// ── Response DTOs ─────────────────────────────────────────────────────────────

export class DashboardDto {
  id: string;
  project_id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

export class WidgetDto {
  id: string;
  dashboard_id: string;
  @ApiPropertyOptional() insight_id: string | null;
  layout: WidgetLayoutDto;
  @ApiPropertyOptional() content: string | null;
  @ApiPropertyOptional() insight: InsightDto | null;
  created_at: Date;
  updated_at: Date;
}

export class DashboardWithWidgetsDto extends DashboardDto {
  widgets: WidgetDto[];
}
