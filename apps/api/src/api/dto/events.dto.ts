import {
  IsArray,
  ValidateNested,
  IsString,
  IsInt,
  Min,
  Max,
  IsDateString,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { Type, Transform, plainToInstance } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StepFilterDto } from './shared/filters.dto';

export class EventsQueryDto {
  @IsUUID()
  project_id: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  event_name?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  date_from?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  date_to?: string;

  @ApiPropertyOptional({ type: [StepFilterDto] })
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    const arr = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(arr) ? plainToInstance(StepFilterDto, arr) : arr;
  })
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

export class EventRowDto {
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
}

export class EventDetailDto extends EventRowDto {
  properties: string;
  user_properties: string;
}

export class EventDetailQueryDto {
  @IsUUID()
  project_id: string;
}

export class EventNamesQueryDto {
  @IsUUID()
  project_id: string;
}

export class EventNamesResponseDto {
  event_names: string[];
}

export class EventPropertyNamesQueryDto {
  @IsUUID()
  project_id: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  event_name?: string;
}

export class EventPropertyNamesResponseDto {
  @ApiProperty({ type: [String] })
  property_names: string[];
}
