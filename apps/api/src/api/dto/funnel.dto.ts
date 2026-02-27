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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

/**
 * Class-level decorator that requires `breakdown_type='cohort'` when
 * `breakdown_cohort_ids` is provided. Passing cohort IDs without the
 * matching breakdown_type silently ignores them, so we reject early.
 */
function BreakdownCohortIdsRequiresCohortType(validationOptions?: ValidationOptions) {
  return function (target: object) {
    registerDecorator({
      name: 'breakdownCohortIdsRequiresCohortType',
      target: target as new (...args: unknown[]) => unknown,
      propertyName: 'breakdown_cohort_ids',
      options: {
        message: "при передаче breakdown_cohort_ids поле breakdown_type должно быть равно 'cohort'",
        ...validationOptions,
      },
      validator: {
        validate(_value: unknown, args: ValidationArguments) {
          const obj = args.object as Record<string, unknown>;
          const hasCohortIds =
            Array.isArray(obj['breakdown_cohort_ids']) &&
            (obj['breakdown_cohort_ids'] as unknown[]).length > 0;
          if (!hasCohortIds) return true;
          return obj['breakdown_type'] === 'cohort';
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
  @IsNotEmpty({ each: true })
  @IsOptional()
  event_names?: string[];

  @IsString()
  @IsNotEmpty()
  label: string;

  @IsArray()
  @ArrayMaxSize(20)
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
  @Max(365)
  // Mandatory when conversion_window_unit is set; otherwise optional.
  // Both fields must be provided together — validated at service level via resolveWindowSeconds().
  // The resolved window (value * unit_seconds) must not exceed 90 days — enforced in resolveWindowSeconds().
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
@BreakdownCohortIdsRequiresCohortType()
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
  @ArrayMaxSize(5)
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

  @ApiPropertyOptional({ enum: ['ordered', 'strict', 'unordered'] })
  @IsIn(['ordered', 'strict', 'unordered'])
  @IsOptional()
  funnel_order_type?: 'ordered' | 'strict' | 'unordered';

  @ApiPropertyOptional({ type: [FunnelExclusionDto] })
  @Transform(makeJsonArrayTransform(FunnelExclusionDto))
  @IsArray()
  @ArrayMaxSize(5)
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
  @ApiProperty({ type: Number, nullable: true })
  avg_time_to_convert_seconds: number | null;
  @ApiPropertyOptional() breakdown_value?: string;
}

export class FunnelResultDto {
  @ApiProperty()
  breakdown: boolean;
  @ApiPropertyOptional() breakdown_property?: string;
  @ApiPropertyOptional({ description: 'Sampling factor used (if < 1.0, results are sampled)' })
  sampling_factor?: number;
  @ApiPropertyOptional({ description: 'True when the number of breakdown groups was truncated to breakdown_limit' })
  breakdown_truncated?: boolean;
  @ApiProperty({ type: [FunnelStepResultDto] })
  @Type(() => FunnelStepResultDto)
  steps: FunnelStepResultDto[];
  @ApiPropertyOptional({ type: [FunnelStepResultDto] })
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
  @ApiProperty({ type: Number, nullable: true })
  average_seconds: number | null;
  @ApiProperty({ type: Number, nullable: true })
  median_seconds: number | null;
  sample_size: number;
  @ApiProperty({ type: [TimeToConvertBinDto] })
  @Type(() => TimeToConvertBinDto)
  bins: TimeToConvertBinDto[];
}

export class TimeToConvertResponseDto extends BaseAnalyticsResponseDto {
  @Type(() => TimeToConvertResultDto)
  data: TimeToConvertResultDto;
}
