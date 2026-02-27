import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsInt,
  IsNumber,
  Min,
  Max,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
  IsBoolean,
  IsUUID,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

function IsLessThan(property: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isLessThan',
      target: (object as { constructor: Function }).constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints as [string];
          const relatedValue = (args.object as Record<string, unknown>)[relatedPropertyName];
          return typeof value === 'number' && typeof relatedValue === 'number' && value < relatedValue;
        },
        defaultMessage(args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints as [string];
          return `${args.property} must be less than ${relatedPropertyName}`;
        },
      },
    });
  };
}

/**
 * Validates that `values` is a non-empty array when the sibling `operator`
 * field requires a list: `in`, `not_in`, `contains_multi`, `not_contains_multi`.
 *
 * Applied to the `values` property of DTO classes that carry both `operator`
 * and `values` fields (CohortEventFilterDto, CohortPropertyConditionDto).
 */
function ValuesMinSizeForOperator(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'valuesMinSizeForOperator',
      target: (object as { constructor: Function }).constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const obj = args.object as Record<string, unknown>;
          const op = obj['operator'] as string | undefined;
          const LIST_OPS = new Set(['in', 'not_in', 'contains_multi', 'not_contains_multi']);
          if (op && LIST_OPS.has(op)) {
            return Array.isArray(value) && value.length >= 1;
          }
          return true;
        },
        defaultMessage() {
          return 'values must contain at least 1 element for in/not_in/contains_multi/not_contains_multi operators';
        },
      },
    });
  };
}

/**
 * Validates that when the sibling `operator` field is `between` or `not_between`,
 * `values` has exactly 2 elements and `values[0] <= values[1]` (ordered range).
 *
 * Applied to the `values` property of DTO classes that carry both `operator`
 * and `values` fields (CohortEventFilterDto, CohortPropertyConditionDto).
 */
function BetweenValuesOrdered(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'betweenValuesOrdered',
      target: (object as { constructor: Function }).constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const obj = args.object as Record<string, unknown>;
          const op = obj['operator'] as string | undefined;
          if (op !== 'between' && op !== 'not_between') return true;
          if (!Array.isArray(value) || value.length !== 2) return false;
          const min = Number(value[0]);
          const max = Number(value[1]);
          if (isNaN(min) || isNaN(max)) return false;
          return min <= max;
        },
        defaultMessage() {
          return 'values[0] must be <= values[1] for between/not_between operators (values must be an ordered numeric range)';
        },
      },
    });
  };
}

const COHORT_OPERATORS = [
  'eq', 'neq', 'contains', 'not_contains', 'contains_multi', 'not_contains_multi',
  'is_set', 'is_not_set', 'gt', 'lt', 'gte', 'lte', 'regex', 'not_regex',
  'in', 'not_in', 'between', 'not_between',
  'is_date_before', 'is_date_after', 'is_date_exact',
] as const;

type CohortOperator = typeof COHORT_OPERATORS[number];

// ── Event filter DTO ────────────────────────────────────────────────────────

export class CohortEventFilterDto {
  @IsString()
  @IsNotEmpty()
  property: string;

  @ApiProperty({ enum: COHORT_OPERATORS })
  @IsIn(COHORT_OPERATORS)
  operator: CohortOperator;

  @IsString()
  @IsOptional()
  value?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ValuesMinSizeForOperator()
  @BetweenValuesOrdered()
  values?: string[];
}

// ── Condition DTOs ───────────────────────────────────────────────────────────

export class CohortPropertyConditionDto {
  @ApiProperty({ enum: ['person_property'] })
  @IsIn(['person_property'])
  type: 'person_property';

  @IsString()
  @IsNotEmpty()
  property: string;

  @ApiProperty({ enum: COHORT_OPERATORS })
  @IsIn(COHORT_OPERATORS)
  operator: CohortOperator;

  @IsString()
  @IsOptional()
  value?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ValuesMinSizeForOperator()
  @BetweenValuesOrdered()
  values?: string[];
}

export class CohortEventConditionDto {
  @ApiProperty({ enum: ['event'] })
  @IsIn(['event'])
  type: 'event';

  @IsString()
  @IsNotEmpty()
  event_name: string;

  @ApiProperty({ enum: ['gte', 'lte', 'eq'] })
  @IsIn(['gte', 'lte', 'eq'])
  count_operator: 'gte' | 'lte' | 'eq';

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  count: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  time_window_days: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CohortEventFilterDto)
  @IsOptional()
  event_filters?: CohortEventFilterDto[];

  @ApiPropertyOptional({ enum: ['count', 'sum', 'avg', 'min', 'max', 'median', 'p75', 'p90', 'p95', 'p99'] })
  @IsIn(['count', 'sum', 'avg', 'min', 'max', 'median', 'p75', 'p90', 'p95', 'p99'])
  @IsOptional()
  aggregation_type?: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'median' | 'p75' | 'p90' | 'p95' | 'p99';

  @IsString()
  @IsOptional()
  aggregation_property?: string;
}

export class CohortCohortConditionDto {
  @ApiProperty({ enum: ['cohort'] })
  @IsIn(['cohort'])
  type: 'cohort';

  @IsUUID()
  cohort_id: string;

  @IsBoolean()
  negated: boolean;
}

export class CohortFirstTimeEventConditionDto {
  @ApiProperty({ enum: ['first_time_event'] })
  @IsIn(['first_time_event'])
  type: 'first_time_event';

  @IsString()
  @IsNotEmpty()
  event_name: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  time_window_days: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CohortEventFilterDto)
  @IsOptional()
  event_filters?: CohortEventFilterDto[];
}

export class CohortNotPerformedEventConditionDto {
  @ApiProperty({ enum: ['not_performed_event'] })
  @IsIn(['not_performed_event'])
  type: 'not_performed_event';

  @IsString()
  @IsNotEmpty()
  event_name: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  time_window_days: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CohortEventFilterDto)
  @IsOptional()
  event_filters?: CohortEventFilterDto[];
}

export class EventSequenceStepDto {
  @IsString()
  @IsNotEmpty()
  event_name: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CohortEventFilterDto)
  @IsOptional()
  event_filters?: CohortEventFilterDto[];
}

export class CohortEventSequenceConditionDto {
  @ApiProperty({ enum: ['event_sequence'] })
  @IsIn(['event_sequence'])
  type: 'event_sequence';

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => EventSequenceStepDto)
  steps: EventSequenceStepDto[];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  time_window_days: number;
}

export class CohortNotPerformedEventSequenceConditionDto {
  @ApiProperty({ enum: ['not_performed_event_sequence'] })
  @IsIn(['not_performed_event_sequence'])
  type: 'not_performed_event_sequence';

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => EventSequenceStepDto)
  steps: EventSequenceStepDto[];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  time_window_days: number;
}

export class CohortPerformedRegularlyConditionDto {
  @ApiProperty({ enum: ['performed_regularly'] })
  @IsIn(['performed_regularly'])
  type: 'performed_regularly';

  @IsString()
  @IsNotEmpty()
  event_name: string;

  @ApiProperty({ enum: ['day', 'week', 'month'] })
  @IsIn(['day', 'week', 'month'])
  period_type: 'day' | 'week' | 'month';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  total_periods: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  min_periods: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  time_window_days: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CohortEventFilterDto)
  @IsOptional()
  event_filters?: CohortEventFilterDto[];
}

export class CohortStoppedPerformingConditionDto {
  @ApiProperty({ enum: ['stopped_performing'] })
  @IsIn(['stopped_performing'])
  type: 'stopped_performing';

  @IsString()
  @IsNotEmpty()
  event_name: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  @IsLessThan('historical_window_days', {
    message: 'recent_window_days must be less than historical_window_days',
  })
  recent_window_days: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  historical_window_days: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CohortEventFilterDto)
  @IsOptional()
  event_filters?: CohortEventFilterDto[];
}

function IsGreaterThanSum(
  prop1: string,
  prop2: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isGreaterThanSum',
      target: (object as { constructor: Function }).constructor,
      propertyName,
      constraints: [prop1, prop2],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [p1, p2] = args.constraints as [string, string];
          const v1 = (args.object as Record<string, unknown>)[p1];
          const v2 = (args.object as Record<string, unknown>)[p2];
          return (
            typeof value === 'number' &&
            typeof v1 === 'number' &&
            typeof v2 === 'number' &&
            value > v1 + v2
          );
        },
        defaultMessage(args: ValidationArguments) {
          const [p1, p2] = args.constraints as [string, string];
          return `${args.property} must be greater than ${p1} + ${p2}`;
        },
      },
    });
  };
}

export class CohortRestartedPerformingConditionDto {
  @ApiProperty({ enum: ['restarted_performing'] })
  @IsIn(['restarted_performing'])
  type: 'restarted_performing';

  @IsString()
  @IsNotEmpty()
  event_name: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  recent_window_days: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  gap_window_days: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  @IsGreaterThanSum('recent_window_days', 'gap_window_days', {
    message: 'historical_window_days must be greater than recent_window_days + gap_window_days',
  })
  historical_window_days: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CohortEventFilterDto)
  @IsOptional()
  event_filters?: CohortEventFilterDto[];
}

// ── Condition Group DTO (recursive nested AND/OR) ────────────────────────────

type CohortConditionValue =
  | CohortPropertyConditionDto
  | CohortEventConditionDto
  | CohortCohortConditionDto
  | CohortFirstTimeEventConditionDto
  | CohortNotPerformedEventConditionDto
  | CohortEventSequenceConditionDto
  | CohortNotPerformedEventSequenceConditionDto
  | CohortPerformedRegularlyConditionDto
  | CohortStoppedPerformingConditionDto
  | CohortRestartedPerformingConditionDto
  | CohortConditionGroupDto;

export class CohortConditionGroupDto {
  @ApiProperty({ enum: ['AND', 'OR'] })
  @IsIn(['AND', 'OR'])
  type: 'AND' | 'OR';

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => Object, {
    discriminator: {
      property: 'type',
      subTypes: [
        { value: CohortPropertyConditionDto, name: 'person_property' },
        { value: CohortEventConditionDto, name: 'event' },
        { value: CohortCohortConditionDto, name: 'cohort' },
        { value: CohortFirstTimeEventConditionDto, name: 'first_time_event' },
        { value: CohortNotPerformedEventConditionDto, name: 'not_performed_event' },
        { value: CohortEventSequenceConditionDto, name: 'event_sequence' },
        { value: CohortNotPerformedEventSequenceConditionDto, name: 'not_performed_event_sequence' },
        { value: CohortPerformedRegularlyConditionDto, name: 'performed_regularly' },
        { value: CohortStoppedPerformingConditionDto, name: 'stopped_performing' },
        { value: CohortRestartedPerformingConditionDto, name: 'restarted_performing' },
        { value: CohortConditionGroupDto, name: 'AND' },
        { value: CohortConditionGroupDto, name: 'OR' },
      ],
    },
    keepDiscriminatorProperty: true,
  })
  values: CohortConditionValue[];
}
