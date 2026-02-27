import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsBoolean,
  IsUUID,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class UploadCsvDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5_000_000)
  csv_content: string;
}

// ── Response DTOs ────────────────────────────────────────────────────────────

export class CohortDto {
  id: string;
  project_id: string;
  created_by: string;
  name: string;
  @ApiPropertyOptional() description: string | null;
  @ApiPropertyOptional({ type: CohortConditionGroupDto })
  definition: CohortConditionGroupDto | null;
  is_static: boolean;
  errors_calculating: number;
  @ApiPropertyOptional() last_error_at: string | null;
  @ApiPropertyOptional() last_error_message: string | null;
  created_at: string;
  updated_at: string;
}

export class CohortMemberCountDto {
  count: number;
}

export class CohortSizeHistoryQueryDto {
  @IsInt()
  @Min(1)
  @Max(365)
  @IsOptional()
  @Type(() => Number)
  @ApiPropertyOptional({ description: 'Number of days of history (default 30)', default: 30 })
  days?: number = 30;
}

export class CohortHistoryPointDto {
  date: string;
  count: number;
}

export class ImportCsvResponseDto {
  imported: number;
  total_lines: number;
}

// ── Static cohort members listing DTOs ────────────────────────────────────────

export class GetStaticCohortMembersQueryDto {
  @IsInt()
  @Min(1)
  @Max(500)
  @IsOptional()
  @Type(() => Number)
  @ApiPropertyOptional({ description: 'Max number of members per page (default 50, max 500)', default: 50 })
  limit?: number = 50;

  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  @ApiPropertyOptional({ description: 'Number of members to skip (default 0)', default: 0 })
  offset?: number = 0;
}

export class StaticCohortMemberDto {
  person_id: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) user_properties: Record<string, unknown>;
}

export class StaticCohortMembersResponseDto {
  @ApiProperty({ type: [StaticCohortMemberDto] }) data: StaticCohortMemberDto[];
  total: number;
}
