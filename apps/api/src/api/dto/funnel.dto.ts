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
  registerDecorator,
  type ValidationOptions,
  type ValidationArguments,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { StepFilterDto } from './shared/filters.dto';
import { parseJsonArray, makeJsonArrayTransform } from './shared/transforms';
import { BaseAnalyticsQueryDto } from './shared/base-analytics-query.dto';
import { BaseAnalyticsResponseDto } from './shared/base-analytics-response.dto';

/**
 * Class-level decorator that enforces mutual exclusion between
 * `breakdown_cohort_ids` and `breakdown_property`.
 * Passing both simultaneously is ambiguous and returns HTTP 400.
 */
function BreakdownMutuallyExclusive(validationOptions?: ValidationOptions) {
  return function (target: object) {
    registerDecorator({
      name: 'breakdownMutuallyExclusive',
      target: target as new (...args: unknown[]) => unknown,
      propertyName: 'breakdown_cohort_ids',
      options: {
        message: 'укажите только один тип breakdown: breakdown_cohort_ids или breakdown_property, но не оба одновременно',
        ...validationOptions,
      },
      validator: {
        validate(_value: unknown, args: ValidationArguments) {
          const obj = args.object as Record<string, unknown>;
          const hasCohortIds =
            Array.isArray(obj['breakdown_cohort_ids']) &&
            (obj['breakdown_cohort_ids'] as unknown[]).length > 0;
          const hasProperty =
            typeof obj['breakdown_property'] === 'string' &&
            obj['breakdown_property'].length > 0;
          // Valid when at most one is provided
          return !(hasCohortIds && hasProperty);
        },
      },
    });
  };
}

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
  @Max(9)
  funnel_from_step: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9)
  funnel_to_step: number;
}

class FunnelBaseQueryDto extends BaseAnalyticsQueryDto {
  @Transform(makeJsonArrayTransform(FunnelStepDto))
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => FunnelStepDto)
  steps: FunnelStepDto[];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  @IsOptional()
  conversion_window_days: number = 14;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // Mandatory when conversion_window_unit is set; otherwise optional.
  // Both fields must be provided together — validated at service level via resolveWindowSeconds().
  @IsOptional()
  conversion_window_value?: number;

  @ApiPropertyOptional({ enum: ['second', 'minute', 'hour', 'day', 'week', 'month'] })
  @IsIn(['second', 'minute', 'hour', 'day', 'week', 'month'])
  // Mandatory when conversion_window_value is set; otherwise optional.
  // Both fields must be provided together — validated at service level via resolveWindowSeconds().
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

@BreakdownMutuallyExclusive()
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

  @ApiPropertyOptional({
    description: 'Max number of breakdown groups to return for property breakdown (2–25). Default: 25.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(25)
  @IsOptional()
  breakdown_limit?: number;
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
  @ApiPropertyOptional({ description: 'True when the number of breakdown groups was truncated to breakdown_limit' })
  breakdown_truncated?: boolean;
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
