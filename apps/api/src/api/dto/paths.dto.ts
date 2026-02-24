import {
  IsArray,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { parseJsonArray } from './shared/transforms';
import { BaseAnalyticsQueryDto } from './shared/base-analytics-query.dto';

export class PathCleaningRuleDto {
  @IsString()
  @IsNotEmpty()
  regex: string;

  @IsString()
  @IsNotEmpty()
  alias: string;
}

export class WildcardGroupDto {
  @IsString()
  @IsNotEmpty()
  pattern: string;

  @IsString()
  @IsNotEmpty()
  alias: string;
}

export class PathsQueryDto extends BaseAnalyticsQueryDto {
  @Transform(({ value }) => (value != null ? Number(value) : 5))
  @IsInt()
  @Min(3)
  @Max(10)
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

export class PathsResponseDto {
  @Type(() => PathsResultDto)
  data: PathsResultDto;

  cached_at: string;
  from_cache: boolean;
}
