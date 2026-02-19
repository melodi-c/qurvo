import { IsString, IsOptional, MinLength, MaxLength, IsObject, IsIn, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, ApiExtraModels, getSchemaPath } from '@nestjs/swagger';
import { FunnelStepDto, TrendSeriesDto } from './analytics.dto';

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
}

type AnyWidgetConfig = FunnelWidgetConfigDto | TrendWidgetConfigDto;

// ── Create / Update DTOs ──────────────────────────────────────────────────────

@ApiExtraModels(FunnelWidgetConfigDto, TrendWidgetConfigDto)
export class CreateWidgetDto {
  @IsString()
  @IsIn(['funnel', 'trend'])
  type: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsObject()
  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(FunnelWidgetConfigDto) },
      { $ref: getSchemaPath(TrendWidgetConfigDto) },
    ],
    discriminator: { propertyName: 'type', mapping: { funnel: getSchemaPath(FunnelWidgetConfigDto), trend: getSchemaPath(TrendWidgetConfigDto) } },
  })
  config: AnyWidgetConfig;

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
  @ApiPropertyOptional({
    oneOf: [
      { $ref: getSchemaPath(FunnelWidgetConfigDto) },
      { $ref: getSchemaPath(TrendWidgetConfigDto) },
    ],
    discriminator: { propertyName: 'type', mapping: { funnel: getSchemaPath(FunnelWidgetConfigDto), trend: getSchemaPath(TrendWidgetConfigDto) } },
  })
  config?: AnyWidgetConfig;

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

@ApiExtraModels(FunnelWidgetConfigDto, TrendWidgetConfigDto)
export class WidgetDto {
  id: string;
  dashboard_id: string;
  type: string;
  name: string;

  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(FunnelWidgetConfigDto) },
      { $ref: getSchemaPath(TrendWidgetConfigDto) },
    ],
    discriminator: { propertyName: 'type', mapping: { funnel: getSchemaPath(FunnelWidgetConfigDto), trend: getSchemaPath(TrendWidgetConfigDto) } },
  })
  config: AnyWidgetConfig;

  layout: WidgetLayoutDto;
  created_at: Date;
  updated_at: Date;
}

export class DashboardWithWidgetsDto extends DashboardDto {
  widgets: WidgetDto[];
}
