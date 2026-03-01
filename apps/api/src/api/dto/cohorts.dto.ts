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
  IsDefined,
  ArrayMaxSize,
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
  @MaxLength(200)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
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
  @MaxLength(200)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @ValidateNested()
  @Type(() => CohortConditionGroupDto)
  @IsOptional()
  definition?: CohortConditionGroupDto;
}

export class CohortPreviewDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => CohortConditionGroupDto)
  @ApiProperty({ type: CohortConditionGroupDto })
  definition: CohortConditionGroupDto;
}

export class CreateStaticCohortDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(10_000)
  @IsOptional()
  person_ids?: string[];
}

export class StaticCohortMembersDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(10_000)
  person_ids: string[];
}

export class UploadCsvDto {
  @IsString()
  @IsNotEmpty()
  // Note: body-parser enforces a 100 kb request body limit before this field is
  // reached, so any MaxLength here would be effectively unreachable. The real
  // cap is controlled by the body-parser limit in main.ts (currently 100 kb).
  csv_content: string;
}

// ── Response DTOs ────────────────────────────────────────────────────────────

export class CohortDto {
  @ApiProperty() id: string;
  @ApiProperty() project_id: string;
  @ApiProperty() created_by: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() description: string | null;
  @ApiPropertyOptional({ type: CohortConditionGroupDto })
  definition: CohortConditionGroupDto | null;
  @ApiProperty() is_static: boolean;
  @ApiProperty() errors_calculating: number;
  @ApiPropertyOptional() last_error_at: string | null;
  @ApiPropertyOptional() last_error_message: string | null;
  @ApiProperty() created_at: string;
  @ApiProperty() updated_at: string;
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
