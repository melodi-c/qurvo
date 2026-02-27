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
import { ApiExtraModels, ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { StepFilterDto } from './shared/filters.dto';
import { parseJsonArray, makeJsonArrayTransform } from './shared/transforms';
import { BaseAnalyticsQueryDto } from './shared/base-analytics-query.dto';
import { BaseAnalyticsResponseDto } from './shared/base-analytics-response.dto';
import {
  BreakdownMutuallyExclusive,
  BreakdownCohortIdsRequiresCohortType,
} from './shared/breakdown-validators';

/**
 * Class-level decorator that rejects simultaneous use of `conversion_window_days`
 * (explicitly set to a non-default value) together with `conversion_window_value/unit`.
 * Passing both is ambiguous — exactly one mechanism should be used per request.
 */
function ConversionWindowMutuallyExclusive(validationOptions?: ValidationOptions) {
  return function (target: object) {
    registerDecorator({
      name: 'conversionWindowMutuallyExclusive',
      target: target as new (...args: unknown[]) => unknown,
      propertyName: 'conversion_window_days',
      options: {
        message: 'specify either conversion_window_days or conversion_window_value/unit, not both',
        ...validationOptions,
      },
      validator: {
        validate(_value: unknown, args: ValidationArguments) {
          const obj = args.object as Record<string, unknown>;
          const days = obj['conversion_window_days'];
          const hasNonDefaultDays =
            typeof days === 'number' && days !== 14;
          const hasValueUnit =
            obj['conversion_window_value'] != null ||
            (typeof obj['conversion_window_unit'] === 'string' &&
              obj['conversion_window_unit'].length > 0);
          // Valid when not both non-default days + value/unit are present
          return !(hasNonDefaultDays && hasValueUnit);
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

@ConversionWindowMutuallyExclusive()
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

// Base step result — used for no-breakdown responses and as aggregate_steps in breakdown responses.
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
}

// Breakdown step result — breakdown_value is REQUIRED (always present when breakdown: true).
export class FunnelBreakdownStepResultDto extends FunnelStepResultDto {
  @ApiProperty({ description: 'Unique breakdown group identifier. For cohort breakdowns this is the cohort UUID.' })
  breakdown_value: string;
  @ApiPropertyOptional({ description: 'Human-readable display label for the breakdown group. Set for cohort breakdowns.' })
  breakdown_label?: string;
}

@ApiExtraModels(FunnelBreakdownStepResultDto)
export class FunnelResultDto {
  @ApiProperty()
  breakdown: boolean;
  @ApiPropertyOptional({ description: 'Breakdown property name (present for property breakdown)' })
  breakdown_property?: string;
  @ApiPropertyOptional({ description: 'Sampling factor used (if < 1.0, results are sampled)' })
  sampling_factor?: number;
  @ApiPropertyOptional({
    description:
      'True when the number of property breakdown groups exceeded breakdown_limit and was truncated. ' +
      'Only set for breakdown_type="property"; never set for cohort breakdown.',
  })
  breakdown_truncated?: boolean;
  /**
   * Step results. When breakdown=false: FunnelStepResult[].
   * When breakdown=true: FunnelBreakdownStepResult[] — each element has a required breakdown_value.
   */
  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(FunnelStepResultDto) },
      { $ref: getSchemaPath(FunnelBreakdownStepResultDto) },
    ],
    isArray: true,
    description:
      'Step results. When breakdown=false each element is FunnelStepResult (no breakdown_value). ' +
      'When breakdown=true each element is FunnelBreakdownStepResult with a required breakdown_value.',
  })
  steps: FunnelStepResultDto[] | FunnelBreakdownStepResultDto[];
  @ApiPropertyOptional({
    type: [FunnelStepResultDto],
    description: 'Aggregate step totals across all breakdown groups. Only present when breakdown=true.',
  })
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
