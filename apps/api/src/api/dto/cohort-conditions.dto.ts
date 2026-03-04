import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsInt,
  Min,
  Max,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
  IsBoolean,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsLessOrEqualTo,
  IsLessThan,
  ValueNotEmptyForDateOperator,
  ValuesMinSizeForOperator,
  BetweenValuesOrdered,
  IsGreaterThanSum,
} from './shared/cohort-condition-validators';

const COHORT_OPERATORS = [
  'eq', 'neq', 'contains', 'not_contains', 'contains_multi', 'not_contains_multi',
  'is_set', 'is_not_set', 'gt', 'lt', 'gte', 'lte', 'regex', 'not_regex',
  'in', 'not_in', 'between', 'not_between',
  'is_date_before', 'is_date_after', 'is_date_exact',
] as const;

type CohortOperator = typeof COHORT_OPERATORS[number];

// Event filter DTO

export class CohortEventFilterDto {
  @IsString()
  @IsNotEmpty()
  property: string;

  @ApiProperty({ enum: COHORT_OPERATORS })
  @IsIn(COHORT_OPERATORS)
  operator: CohortOperator;

  @IsString()
  @IsOptional()
  @ValueNotEmptyForDateOperator()
  value?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ValuesMinSizeForOperator()
  @BetweenValuesOrdered()
  values?: string[];
}

// Condition DTOs

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
  @ValueNotEmptyForDateOperator()
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
  @IsInt()
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
  @Max(365)
  total_periods: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  @IsLessOrEqualTo('total_periods', { message: 'min_periods must be \u2264 total_periods' })
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

// Condition Group DTO (recursive nested AND/OR)

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
