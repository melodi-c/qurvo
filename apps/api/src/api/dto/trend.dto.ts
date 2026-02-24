import {
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsIn,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StepFilterDto } from './shared/filters.dto';
import { parseJsonArray, makeJsonArrayTransform } from './shared/transforms';
import { BaseAnalyticsQueryDto } from './shared/base-analytics-query.dto';

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

export class TrendQueryDto extends BaseAnalyticsQueryDto {
  @Transform(makeJsonArrayTransform(TrendSeriesDto))
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => TrendSeriesDto)
  series: TrendSeriesDto[];

  @ApiProperty({ enum: ['total_events', 'unique_users', 'events_per_user', 'property_sum', 'property_avg', 'property_min', 'property_max'], enumName: 'TrendMetric' })
  @IsIn(['total_events', 'unique_users', 'events_per_user', 'property_sum', 'property_avg', 'property_min', 'property_max'])
  metric: 'total_events' | 'unique_users' | 'events_per_user' | 'property_sum' | 'property_avg' | 'property_min' | 'property_max';

  @IsString()
  @IsOptional()
  metric_property?: string;

  @ApiProperty({ enum: ['hour', 'day', 'week', 'month'], enumName: 'TrendGranularity' })
  @IsIn(['hour', 'day', 'week', 'month'])
  granularity: 'hour' | 'day' | 'week' | 'month';

  @IsString()
  @IsOptional()
  breakdown_property?: string;

  @ApiPropertyOptional({ enum: ['property', 'cohort'] })
  @IsIn(['property', 'cohort'])
  @IsOptional()
  breakdown_type?: 'property' | 'cohort';

  @ApiPropertyOptional({ type: [String] })
  @Transform(parseJsonArray)
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  breakdown_cohort_ids?: string[];

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  compare?: boolean;
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
