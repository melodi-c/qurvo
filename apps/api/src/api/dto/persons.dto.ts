import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsString, IsOptional, IsInt, Min, Max, IsArray, ValidateNested, IsIn, IsNotEmpty } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { StepFilterDto } from './shared/filters.dto';
import { makeJsonArrayTransform } from './shared/transforms';
import { IsDateRange } from './shared/is-date-only.decorator';
import { EventDetailDto } from './events.dto';

export class PersonsQueryDto {
  @IsUUID()
  project_id: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ type: [StepFilterDto] })
  @IsOptional()
  @Transform(makeJsonArrayTransform(StepFilterDto))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StepFilterDto)
  filters?: StepFilterDto[];

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 50;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number = 0;
}

export class PersonDto {
  id: string;
  project_id: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  properties: Record<string, unknown>;
  @ApiProperty({ type: [String] })
  distinct_ids: string[];
  created_at: string;
  updated_at: string;
}

export class PersonsListResponseDto {
  persons: PersonDto[];
  total: number;
}

export class PersonEventsQueryDto {
  @IsUUID()
  project_id: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 50;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number = 0;
}

export class PersonEventRowDto extends EventDetailDto {}

export class PersonByIdQueryDto {
  @IsUUID()
  project_id: string;
}

export class PersonPropertyNamesQueryDto {
  @IsUUID()
  project_id: string;
}

export class PersonPropertyNamesResponseDto {
  @ApiProperty({ type: [String] })
  property_names: string[];
}

export class PersonCohortDto {
  cohort_id: string;
  name: string;
  is_static: boolean;
}

export class PersonCohortsResponseDto {
  @ApiProperty({ type: [PersonCohortDto] })
  cohorts: PersonCohortDto[];
}

export class PersonsAtPointResponseDto {
  @ApiProperty({ type: [PersonDto] })
  persons: PersonDto[];
  total: number;
}

export class PersonsAtTrendBucketQueryDto {
  @IsUUID()
  project_id: string;

  @IsString()
  @IsNotEmpty()
  event_name: string;

  @ApiProperty({ enum: ['hour', 'day', 'week', 'month'], enumName: 'TrendGranularity' })
  @IsIn(['hour', 'day', 'week', 'month'])
  granularity: 'hour' | 'day' | 'week' | 'month';

  @IsString()
  @IsNotEmpty()
  bucket: string;

  @IsDateRange()
  date_from: string;

  @IsDateRange()
  date_to: string;

  @ApiPropertyOptional({ type: [StepFilterDto] })
  @IsOptional()
  @Transform(makeJsonArrayTransform(StepFilterDto))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StepFilterDto)
  filters?: StepFilterDto[];

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 50;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number = 0;
}

export class PersonsAtStickinessBarQueryDto {
  @IsUUID()
  project_id: string;

  @IsString()
  @IsNotEmpty()
  event_name: string;

  @ApiProperty({ enum: ['day', 'week', 'month'], enumName: 'StickinessGranularity' })
  @IsIn(['day', 'week', 'month'])
  granularity: 'day' | 'week' | 'month';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  period_count: number;

  @IsDateRange()
  date_from: string;

  @IsDateRange()
  date_to: string;

  @ApiPropertyOptional({ type: [StepFilterDto] })
  @IsOptional()
  @Transform(makeJsonArrayTransform(StepFilterDto))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StepFilterDto)
  filters?: StepFilterDto[];

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 50;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number = 0;
}
