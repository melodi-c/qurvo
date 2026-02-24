import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsString, IsOptional, IsInt, Min, Max, IsArray, ValidateNested } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { StepFilterDto } from './shared/filters.dto';
import { makeJsonArrayTransform } from './shared/transforms';

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

export class PersonEventRowDto {
  event_id: string;
  event_name: string;
  event_type: string;
  distinct_id: string;
  person_id: string;
  session_id: string;
  timestamp: string;
  url: string;
  referrer: string;
  page_title: string;
  page_path: string;
  device_type: string;
  browser: string;
  browser_version: string;
  os: string;
  os_version: string;
  screen_width: number;
  screen_height: number;
  country: string;
  region: string;
  city: string;
  language: string;
  timezone: string;
  sdk_name: string;
  sdk_version: string;
  properties: string;
  user_properties: string;
}

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
