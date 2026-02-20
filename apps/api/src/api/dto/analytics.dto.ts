import {
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  IsDateString,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsIn,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export type FilterOperator = 'eq' | 'neq' | 'contains' | 'not_contains' | 'is_set' | 'is_not_set';

export class StepFilterDto {
  @IsString()
  @IsNotEmpty()
  property: string;

  @IsIn(['eq', 'neq', 'contains', 'not_contains', 'is_set', 'is_not_set'])
  operator: FilterOperator;

  @IsString()
  @IsOptional()
  value?: string;
}

export class FunnelStepDto {
  @IsString()
  @IsNotEmpty()
  event_name: string;

  @IsString()
  @IsNotEmpty()
  label: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => StepFilterDto)
  filters?: StepFilterDto[];
}

export class FunnelQueryDto {
  @IsUUID()
  project_id: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => FunnelStepDto)
  steps: FunnelStepDto[];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  conversion_window_days: number = 14;

  @IsDateString()
  date_from: string;

  @IsDateString()
  date_to: string;

  @IsString()
  @IsOptional()
  breakdown_property?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  cohort_ids?: string[];

  @IsUUID()
  @IsOptional()
  widget_id?: string;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  force?: boolean;
}

// breakdown_value присутствует только у breakdown-шагов, поэтому optional
export class FunnelStepResultDto {
  step: number;
  label: string;
  event_name: string;
  count: number;
  conversion_rate: number;
  drop_off: number;
  drop_off_rate: number;
  avg_time_to_convert_seconds: number | null;
  @ApiPropertyOptional() breakdown_value?: string;
}

export class FunnelResultDto {
  breakdown: boolean;
  @ApiPropertyOptional() breakdown_property?: string;
  @Type(() => FunnelStepResultDto)
  steps: FunnelStepResultDto[];
  @ApiPropertyOptional()
  @Type(() => FunnelStepResultDto)
  aggregate_steps?: FunnelStepResultDto[];
}

export class FunnelResponseDto {
  @Type(() => FunnelResultDto)
  data: FunnelResultDto;
  cached_at: string;
  from_cache: boolean;
}

export class EventsQueryDto {
  @IsUUID()
  project_id: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  event_name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  distinct_id?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  date_from?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  date_to?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 50;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number = 0;
}

export class EventRowDto {
  event_id: string;
  event_name: string;
  event_type: string;
  distinct_id: string;
  person_id: string;
  session_id: string;
  timestamp: string;
  url: string;
  referrer: string;
  page_title: string;
  page_path: string;
  device_type: string;
  browser: string;
  browser_version: string;
  os: string;
  os_version: string;
  screen_width: number;
  screen_height: number;
  country: string;
  region: string;
  city: string;
  language: string;
  timezone: string;
  sdk_name: string;
  sdk_version: string;
  properties: string;
  user_properties: string;
}

export class EventNamesQueryDto {
  @IsUUID()
  project_id: string;
}

export class EventNamesResponseDto {
  event_names: string[];
}

// ── Trend DTOs ─────────────────────────────────────────────────────────────────

export class TrendSeriesDto {
  @IsString()
  @IsNotEmpty()
  event_name: string;

  @IsString()
  @IsNotEmpty()
  label: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => StepFilterDto)
  filters?: StepFilterDto[];
}

export class TrendQueryDto {
  @IsUUID()
  project_id: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => TrendSeriesDto)
  series: TrendSeriesDto[];

  @IsIn(['total_events', 'unique_users', 'events_per_user'])
  metric: 'total_events' | 'unique_users' | 'events_per_user';

  @IsIn(['hour', 'day', 'week', 'month'])
  granularity: 'hour' | 'day' | 'week' | 'month';

  @IsDateString()
  date_from: string;

  @IsDateString()
  date_to: string;

  @IsString()
  @IsOptional()
  breakdown_property?: string;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  compare?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  cohort_ids?: string[];

  @IsUUID()
  @IsOptional()
  widget_id?: string;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  force?: boolean;
}

export class TrendDataPointDto {
  bucket: string;
  value: number;
}

export class TrendSeriesResultDto {
  series_idx: number;
  label: string;
  event_name: string;
  @Type(() => TrendDataPointDto)
  data: TrendDataPointDto[];
  @ApiPropertyOptional() breakdown_value?: string;
}

export class TrendResultDto {
  compare: boolean;
  breakdown: boolean;
  @ApiPropertyOptional() breakdown_property?: string;
  @Type(() => TrendSeriesResultDto)
  series: TrendSeriesResultDto[];
  @ApiPropertyOptional()
  @Type(() => TrendSeriesResultDto)
  series_previous?: TrendSeriesResultDto[];
}

export class TrendResponseDto {
  @Type(() => TrendResultDto)
  data: TrendResultDto;
  cached_at: string;
  from_cache: boolean;
}

// ── Retention DTOs ──────────────────────────────────────────────────────────

export class RetentionQueryDto {
  @IsUUID()
  project_id: string;

  @IsString()
  @IsNotEmpty()
  target_event: string;

  @IsIn(['first_time', 'recurring'])
  retention_type: 'first_time' | 'recurring';

  @IsIn(['day', 'week', 'month'])
  granularity: 'day' | 'week' | 'month';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  periods: number = 11;

  @IsDateString()
  date_from: string;

  @IsDateString()
  date_to: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  cohort_ids?: string[];

  @IsUUID()
  @IsOptional()
  widget_id?: string;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  force?: boolean;
}

export class RetentionCohortDto {
  cohort_date: string;
  cohort_size: number;
  periods: number[];
}

export class RetentionResultDto {
  retention_type: string;
  granularity: string;
  @Type(() => RetentionCohortDto)
  cohorts: RetentionCohortDto[];
  average_retention: number[];
}

export class RetentionResponseDto {
  @Type(() => RetentionResultDto)
  data: RetentionResultDto;
  cached_at: string;
  from_cache: boolean;
}
