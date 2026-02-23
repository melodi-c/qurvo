import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsBoolean,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CohortConditionGroupDto } from './cohort-conditions.dto';

// Re-export so existing imports from './cohorts.dto' keep working
export { CohortConditionGroupDto } from './cohort-conditions.dto';

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
}

export class CohortPreviewDto {
  @ValidateNested()
  @Type(() => CohortConditionGroupDto)
  @IsOptional()
  definition?: CohortConditionGroupDto;
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
