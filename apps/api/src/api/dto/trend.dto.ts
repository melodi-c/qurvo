import {
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ArrayUnique,
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
import { BaseAnalyticsResponseDto } from './shared/base-analytics-response.dto';
import {
  BreakdownMutuallyExclusive,
  BreakdownCohortIdsRequiresCohortType,
} from './shared/breakdown-validators';

const TREND_METRICS = [
  'total_events', 'unique_users', 'events_per_user',
  'property_sum', 'property_avg', 'property_min', 'property_max',
  'first_time_users',
] as const;

export class TrendSeriesDto {
  @IsString()
  @IsNotEmpty()
  event_name: string;

  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiProperty({ enum: TREND_METRICS, enumName: 'TrendMetric' })
  @IsIn(TREND_METRICS)
  metric: (typeof TREND_METRICS)[number];

  @IsString()
  @IsOptional()
  metric_property?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => StepFilterDto)
  filters?: StepFilterDto[];

  @IsBoolean()
  @IsOptional()
  hidden?: boolean;
}

@BreakdownMutuallyExclusive()
@BreakdownCohortIdsRequiresCohortType()
export class TrendQueryDto extends BaseAnalyticsQueryDto {
  @Transform(makeJsonArrayTransform(TrendSeriesDto))
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => TrendSeriesDto)
  series: TrendSeriesDto[];

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
  @ArrayMaxSize(10)
  @ArrayUnique()
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
  @ApiPropertyOptional({ description: 'Human-readable display label for the breakdown group. Set for cohort breakdowns.' })
  breakdown_label?: string;
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

export class TrendResponseDto extends BaseAnalyticsResponseDto {
  @Type(() => TrendResultDto)
  data: TrendResultDto;
}
