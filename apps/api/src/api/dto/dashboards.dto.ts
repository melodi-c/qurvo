import { IsString, IsOptional, MinLength, MaxLength, IsObject, IsIn, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { FunnelStepDto } from './analytics.dto';

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

export class FunnelWidgetConfigDto {
  type: 'funnel';
  steps: FunnelStepDto[];
  conversion_window_days: number;
  date_from: string;
  date_to: string;
  @IsOptional() breakdown_property?: string;
}

export class CreateWidgetDto {
  @IsString()
  @IsIn(['funnel'])
  type: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsObject()
  config: FunnelWidgetConfigDto;

  @IsObject()
  @Type(() => WidgetLayoutDto)
  layout: WidgetLayoutDto;
}

export class UpdateWidgetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @IsObject()
  @IsOptional()
  config?: FunnelWidgetConfigDto;

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
  type: string;
  name: string;
  config: FunnelWidgetConfigDto;
  layout: WidgetLayoutDto;
  created_at: Date;
  updated_at: Date;
}

export class DashboardWithWidgetsDto extends DashboardDto {
  widgets: WidgetDto[];
}
