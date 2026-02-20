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
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

// ── Condition DTOs ───────────────────────────────────────────────────────────

export class CohortPropertyConditionDto {
  @IsIn(['person_property'])
  type: 'person_property';

  @IsString()
  @IsNotEmpty()
  property: string;

  @IsIn(['eq', 'neq', 'contains', 'not_contains', 'is_set', 'is_not_set'])
  operator: 'eq' | 'neq' | 'contains' | 'not_contains' | 'is_set' | 'is_not_set';

  @IsString()
  @IsOptional()
  value?: string;
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
}

// ── Definition DTO ───────────────────────────────────────────────────────────

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
  @Type(() => CohortDefinitionDto)
  definition: CohortDefinitionDto;
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
  @Type(() => CohortDefinitionDto)
  @IsOptional()
  definition?: CohortDefinitionDto;
}

export class CohortPreviewDto {
  @ValidateNested()
  @Type(() => CohortDefinitionDto)
  definition: CohortDefinitionDto;
}

// ── Response DTOs ────────────────────────────────────────────────────────────

export class CohortDto {
  id: string;
  project_id: string;
  created_by: string;
  name: string;
  @ApiPropertyOptional() description: string | null;
  definition: CohortDefinitionDto;
  created_at: string;
  updated_at: string;
}

export class CohortMemberCountDto {
  count: number;
}
