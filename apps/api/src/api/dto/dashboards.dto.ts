import { IsString, IsOptional, MinLength, MaxLength, IsObject, IsNotEmpty, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FunnelStepDto, TrendSeriesDto } from './analytics.dto';
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
  date_from: string;
  date_to: string;
  @ApiPropertyOptional() breakdown_property?: string;
  @ApiPropertyOptional({ type: [String] }) cohort_ids?: string[];
}

export class TrendWidgetConfigDto {
  @ApiProperty({ enum: ['trend'] })
  type: 'trend';

  @ApiProperty({ type: [TrendSeriesDto] })
  series: TrendSeriesDto[];

  @ApiProperty({ enum: ['total_events', 'unique_users', 'events_per_user'] })
  metric: 'total_events' | 'unique_users' | 'events_per_user';

  @ApiProperty({ enum: ['hour', 'day', 'week', 'month'] })
  granularity: 'hour' | 'day' | 'week' | 'month';

  @ApiProperty({ enum: ['line', 'bar'] })
  chart_type: 'line' | 'bar';

  date_from: string;
  date_to: string;
  @ApiPropertyOptional() breakdown_property?: string;
  compare: boolean;
  @ApiPropertyOptional({ type: [String] }) cohort_ids?: string[];
}

export class RetentionWidgetConfigDto {
  @ApiProperty({ enum: ['retention'] })
  type: 'retention';

  target_event: string;

  @ApiProperty({ enum: ['first_time', 'recurring'] })
  retention_type: 'first_time' | 'recurring';

  @ApiProperty({ enum: ['day', 'week', 'month'] })
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

  @ApiProperty({ enum: ['day', 'week', 'month'] })
  granularity: 'day' | 'week' | 'month';

  date_from: string;
  date_to: string;
  @ApiPropertyOptional({ type: [String] }) cohort_ids?: string[];
}

export class StickinessWidgetConfigDto {
  @ApiProperty({ enum: ['stickiness'] })
  type: 'stickiness';

  target_event: string;

  @ApiProperty({ enum: ['day', 'week', 'month'] })
  granularity: 'day' | 'week' | 'month';

  date_from: string;
  date_to: string;
  @ApiPropertyOptional({ type: [String] }) cohort_ids?: string[];
}

// ── Create / Update Widget DTOs ─────────────────────────────────────────────

export class CreateWidgetDto {
  @IsUUID()
  insight_id: string;

  @IsObject()
  @Type(() => WidgetLayoutDto)
  layout: WidgetLayoutDto;
}

export class UpdateWidgetDto {
  @IsUUID()
  @IsOptional()
  insight_id?: string;

  @IsObject()
  @IsOptional()
  @Type(() => WidgetLayoutDto)
  layout?: WidgetLayoutDto;
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
  @ApiPropertyOptional() insight: InsightDto | null;
  created_at: Date;
  updated_at: Date;
}

export class DashboardWithWidgetsDto extends DashboardDto {
  widgets: WidgetDto[];
}
