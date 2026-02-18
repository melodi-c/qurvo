import { IsString, IsOptional, IsUUID, IsInt, Min, Max, IsEnum, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class EventsQueryDto {
  @IsUUID()
  project_id: string;

  @IsString()
  @IsOptional()
  event_name?: string;

  @IsString()
  @IsOptional()
  distinct_id?: string;

  @IsDateString()
  @IsOptional()
  from?: string;

  @IsDateString()
  @IsOptional()
  to?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  @IsOptional()
  limit: number = 50;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  offset: number = 0;
}

export class CountsQueryDto {
  @IsUUID()
  project_id: string;

  @IsString()
  @IsOptional()
  event_name?: string;

  @IsDateString()
  @IsOptional()
  from?: string;

  @IsDateString()
  @IsOptional()
  to?: string;
}

export enum Granularity {
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export class TrendsQueryDto {
  @IsUUID()
  project_id: string;

  @IsString()
  @IsOptional()
  event_name?: string;

  @IsDateString()
  from: string;

  @IsDateString()
  to: string;

  @IsEnum(Granularity)
  @IsOptional()
  granularity: Granularity = Granularity.DAY;
}

export class TopEventsQueryDto {
  @IsUUID()
  project_id: string;

  @IsDateString()
  @IsOptional()
  from?: string;

  @IsDateString()
  @IsOptional()
  to?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit: number = 10;
}

export class EventRowDto {
  event_id: string;
  project_id: string;
  event_name: string;
  event_type: string;
  distinct_id: string;
  anonymous_id?: string;
  user_id?: string;
  session_id?: string;
  url?: string;
  referrer?: string;
  page_title?: string;
  page_path?: string;
  device_type?: string;
  browser?: string;
  browser_version?: string;
  os?: string;
  os_version?: string;
  screen_width?: number;
  screen_height?: number;
  country?: string;
  region?: string;
  city?: string;
  language?: string;
  timezone?: string;
  properties?: string;
  user_properties?: string;
  sdk_name?: string;
  sdk_version?: string;
  timestamp: string;
  ingested_at?: string;
  batch_id?: string;
}

export class CountsResponseDto {
  count: string;
  unique_users: string;
  sessions: string;
}

export class TrendItemDto {
  period: string;
  count: string;
  unique_users: string;
}

export class TopEventItemDto {
  event_name: string;
  count: string;
  unique_users: string;
}
