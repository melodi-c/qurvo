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
  IsBoolean,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

// ── Event filter DTO ────────────────────────────────────────────────────────

export class CohortEventFilterDto {
  @IsString()
  @IsNotEmpty()
  property: string;

  @IsIn(['eq', 'neq', 'contains', 'not_contains', 'is_set', 'is_not_set',
    'gt', 'lt', 'gte', 'lte', 'regex', 'not_regex',
    'in', 'not_in', 'between', 'not_between'])
  operator: 'eq' | 'neq' | 'contains' | 'not_contains' | 'is_set' | 'is_not_set'
    | 'gt' | 'lt' | 'gte' | 'lte' | 'regex' | 'not_regex'
    | 'in' | 'not_in' | 'between' | 'not_between';

  @IsString()
  @IsOptional()
  value?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  values?: string[];
}

// ── Condition DTOs ───────────────────────────────────────────────────────────

export class CohortPropertyConditionDto {
  @IsIn(['person_property'])
  type: 'person_property';

  @IsString()
  @IsNotEmpty()
  property: string;

  @IsIn(['eq', 'neq', 'contains', 'not_contains', 'is_set', 'is_not_set',
    'gt', 'lt', 'gte', 'lte', 'regex', 'not_regex',
    'in', 'not_in', 'between', 'not_between'])
  operator: 'eq' | 'neq' | 'contains' | 'not_contains' | 'is_set' | 'is_not_set'
    | 'gt' | 'lt' | 'gte' | 'lte' | 'regex' | 'not_regex'
    | 'in' | 'not_in' | 'between' | 'not_between';

  @IsString()
  @IsOptional()
  value?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  values?: string[];
}

export class CohortEventConditionDto {
  @IsIn(['event'])
  type: 'event';

  @IsString()
  @IsNotEmpty()
  event_name: string;

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
}

export class CohortCohortConditionDto {
  @IsIn(['cohort'])
  type: 'cohort';

  @IsUUID()
  cohort_id: string;

  @IsBoolean()
  negated: boolean;
}

export class CohortFirstTimeEventConditionDto {
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
  @IsIn(['performed_regularly'])
  type: 'performed_regularly';

  @IsString()
  @IsNotEmpty()
  event_name: string;

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
  @IsIn(['stopped_performing'])
  type: 'stopped_performing';

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
  historical_window_days: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CohortEventFilterDto)
  @IsOptional()
  event_filters?: CohortEventFilterDto[];
}

export class CohortRestartedPerformingConditionDto {
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
  historical_window_days: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CohortEventFilterDto)
  @IsOptional()
  event_filters?: CohortEventFilterDto[];
}

// ── Condition Group DTO (recursive nested AND/OR) ────────────────────────────

export class CohortConditionGroupDto {
  @IsIn(['AND', 'OR'])
  type: 'AND' | 'OR';

  @IsArray()
  @ArrayMinSize(1)
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
  values: any[];
}

// ── V1 Definition (legacy compat) ────────────────────────────────────────────

export class CohortDefinitionDto {
  @IsIn(['all', 'any'])
  match: 'all' | 'any';

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => Object, {
    discriminator: {
      property: 'type',
      subTypes: [
        { value: CohortPropertyConditionDto, name: 'person_property' },
        { value: CohortEventConditionDto, name: 'event' },
      ],
    },
    keepDiscriminatorProperty: true,
  })
  conditions: (CohortPropertyConditionDto | CohortEventConditionDto)[];
}

// ── CRUD DTOs ────────────────────────────────────────────────────────────────

export class CreateCohortDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @ValidateNested()
  @Type(() => CohortConditionGroupDto)
  @IsOptional()
  definition?: CohortConditionGroupDto;

  @ValidateNested()
  @Type(() => CohortDefinitionDto)
  @IsOptional()
  legacy_definition?: CohortDefinitionDto;

  @IsBoolean()
  @IsOptional()
  is_static?: boolean;
}

export class UpdateCohortDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @ValidateNested()
  @Type(() => CohortConditionGroupDto)
  @IsOptional()
  definition?: CohortConditionGroupDto;

  @ValidateNested()
  @Type(() => CohortDefinitionDto)
  @IsOptional()
  legacy_definition?: CohortDefinitionDto;
}

export class CohortPreviewDto {
  @ValidateNested()
  @Type(() => CohortConditionGroupDto)
  @IsOptional()
  definition?: CohortConditionGroupDto;

  @ValidateNested()
  @Type(() => CohortDefinitionDto)
  @IsOptional()
  legacy_definition?: CohortDefinitionDto;
}

export class CreateStaticCohortDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  person_ids?: string[];
}

export class StaticCohortMembersDto {
  @IsArray()
  @IsUUID('4', { each: true })
  person_ids: string[];
}

// ── Response DTOs ────────────────────────────────────────────────────────────

export class CohortDto {
  id: string;
  project_id: string;
  created_by: string;
  name: string;
  @ApiPropertyOptional() description: string | null;
  definition: any;
  is_static: boolean;
  created_at: string;
  updated_at: string;
}

export class CohortMemberCountDto {
  count: number;
}
