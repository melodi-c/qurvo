import {
  IsArray,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Max,
  MaxLength,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { parseJsonArray } from './shared/transforms';
import { BaseAnalyticsQueryDto } from './shared/base-analytics-query.dto';
import { BaseAnalyticsResponseDto } from './shared/base-analytics-response.dto';

export class PathCleaningRuleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Matches(/^[^\x00-\x1f'\\]+$/, { message: 'Must not contain control characters, quotes, or backslashes' })
  regex: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Matches(/^[\w\s\-./]+$/, { message: 'Must contain only alphanumeric, spaces, hyphens, dots, and slashes' })
  alias: string;
}

export class WildcardGroupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Matches(/^[^\x00-\x1f'\\]+$/, { message: 'Must not contain control characters, quotes, or backslashes' })
  pattern: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Matches(/^[^\x00-\x1f'\\]+$/, { message: 'Must not contain control characters, quotes, or backslashes' })
  alias: string;
}

export class PathsQueryDto extends BaseAnalyticsQueryDto {
  @Transform(({ value }) => (value != null ? Number(value) : 5))
  @IsInt()
  @Min(3)
  @Max(1000)
  @IsOptional()
  step_limit?: number = 5;

  @IsString()
  @IsOptional()
  start_event?: string;

  @IsString()
  @IsOptional()
  end_event?: string;

  @ApiPropertyOptional({ type: [String] })
  @Transform(parseJsonArray)
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  exclusions?: string[];

  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  @IsOptional()
  min_persons?: number;

  @ApiPropertyOptional({ type: [PathCleaningRuleDto] })
  @Transform(parseJsonArray)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PathCleaningRuleDto)
  @IsOptional()
  path_cleaning_rules?: PathCleaningRuleDto[];

  @ApiPropertyOptional({ type: [WildcardGroupDto] })
  @Transform(parseJsonArray)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WildcardGroupDto)
  @IsOptional()
  wildcard_groups?: WildcardGroupDto[];
}

export class PathTransitionDto {
  step: number;
  source: string;
  target: string;
  person_count: number;
}

export class TopPathDto {
  path: string[];
  person_count: number;
}

export class PathsResultDto {
  @Type(() => PathTransitionDto)
  transitions: PathTransitionDto[];

  @Type(() => TopPathDto)
  top_paths: TopPathDto[];
}

export class PathsResponseDto extends BaseAnalyticsResponseDto {
  @Type(() => PathsResultDto)
  data: PathsResultDto;
}
