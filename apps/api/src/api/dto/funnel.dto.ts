import {
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  IsString,
  IsNotEmpty,
  IsInt,
  IsNumber,
  Min,
  Max,
  IsOptional,
  IsUUID,
  IsIn,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { StepFilterDto } from './shared/filters.dto';
import { parseJsonArray, makeJsonArrayTransform } from './shared/transforms';
import { BaseAnalyticsQueryDto } from './shared/base-analytics-query.dto';
import { BaseAnalyticsResponseDto } from './shared/base-analytics-response.dto';

export class FunnelStepDto {
  @IsString()
  @IsNotEmpty()
  event_name: string;

  @ApiPropertyOptional({ type: [String], description: 'Additional event names for OR-logic within step' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  event_names?: string[];

  @IsString()
  @IsNotEmpty()
  label: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => StepFilterDto)
  filters?: StepFilterDto[];
}

export class FunnelExclusionDto {
  @IsString()
  @IsNotEmpty()
  event_name: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  funnel_from_step: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  funnel_to_step: number;
}

class FunnelBaseQueryDto extends BaseAnalyticsQueryDto {
  @Transform(makeJsonArrayTransform(FunnelStepDto))
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

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  conversion_window_value?: number;

  @ApiPropertyOptional({ enum: ['second', 'minute', 'hour', 'day', 'week', 'month'] })
  @IsIn(['second', 'minute', 'hour', 'day', 'week', 'month'])
  @IsOptional()
  conversion_window_unit?: string;

  @ApiPropertyOptional({ description: 'Sampling factor 0.0-1.0 (1.0 = no sampling)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(1)
  @IsOptional()
  sampling_factor?: number;
}

export class FunnelQueryDto extends FunnelBaseQueryDto {
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
  @IsUUID('4', { each: true })
  @IsOptional()
  breakdown_cohort_ids?: string[];

  @ApiPropertyOptional({ enum: ['ordered', 'strict', 'unordered'] })
  @IsIn(['ordered', 'strict', 'unordered'])
  @IsOptional()
  funnel_order_type?: 'ordered' | 'strict' | 'unordered';

  @ApiPropertyOptional({ type: [FunnelExclusionDto] })
  @Transform(makeJsonArrayTransform(FunnelExclusionDto))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FunnelExclusionDto)
  @IsOptional()
  exclusions?: FunnelExclusionDto[];
}

export class FunnelTimeToConvertQueryDto extends FunnelBaseQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  from_step: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  to_step: number;

  @ApiPropertyOptional({ type: [FunnelExclusionDto] })
  @Transform(makeJsonArrayTransform(FunnelExclusionDto))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FunnelExclusionDto)
  @IsOptional()
  exclusions?: FunnelExclusionDto[];
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
  @ApiPropertyOptional({ description: 'Sampling factor used (if < 1.0, results are sampled)' })
  sampling_factor?: number;
  @Type(() => FunnelStepResultDto)
  steps: FunnelStepResultDto[];
  @ApiPropertyOptional()
  @Type(() => FunnelStepResultDto)
  aggregate_steps?: FunnelStepResultDto[];
}

export class FunnelResponseDto extends BaseAnalyticsResponseDto {
  @Type(() => FunnelResultDto)
  data: FunnelResultDto;
}

export class TimeToConvertBinDto {
  from_seconds: number;
  to_seconds: number;
  count: number;
}

export class TimeToConvertResultDto {
  from_step: number;
  to_step: number;
  average_seconds: number | null;
  median_seconds: number | null;
  sample_size: number;
  @Type(() => TimeToConvertBinDto)
  bins: TimeToConvertBinDto[];
}

export class TimeToConvertResponseDto extends BaseAnalyticsResponseDto {
  @Type(() => TimeToConvertResultDto)
  data: TimeToConvertResultDto;
}
