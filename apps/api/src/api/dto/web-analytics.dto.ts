import {
  IsArray,
  IsDateString,
  IsOptional,
  IsUUID,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { StepFilterDto } from './shared/filters.dto';

export class WebAnalyticsQueryDto {
  @IsUUID()
  project_id: string;

  @IsDateString()
  date_from: string;

  @IsDateString()
  date_to: string;

  @ApiPropertyOptional({ type: [StepFilterDto] })
  @Transform(({ value }) => {
    if (!value) return undefined;
    return typeof value === 'string' ? JSON.parse(value) : value;
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StepFilterDto)
  @IsOptional()
  filters?: StepFilterDto[];

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  force?: boolean;
}

export class WebAnalyticsKPIsDto {
  unique_visitors: number;
  pageviews: number;
  sessions: number;
  avg_duration_seconds: number;
  bounce_rate: number;
}

export class WebAnalyticsTimeseriesPointDto {
  bucket: string;
  unique_visitors: number;
  pageviews: number;
  sessions: number;
}

export class WebAnalyticsOverviewResponseDto {
  @Type(() => WebAnalyticsKPIsDto)
  current: WebAnalyticsKPIsDto;

  @Type(() => WebAnalyticsKPIsDto)
  previous: WebAnalyticsKPIsDto;

  @Type(() => WebAnalyticsTimeseriesPointDto)
  timeseries: WebAnalyticsTimeseriesPointDto[];

  granularity: string;
}

export class WebAnalyticsDimensionRowDto {
  name: string;
  visitors: number;
  pageviews: number;
}

export class WebAnalyticsPathsResponseDto {
  @Type(() => WebAnalyticsDimensionRowDto)
  top_pages: WebAnalyticsDimensionRowDto[];

  @Type(() => WebAnalyticsDimensionRowDto)
  entry_pages: WebAnalyticsDimensionRowDto[];

  @Type(() => WebAnalyticsDimensionRowDto)
  exit_pages: WebAnalyticsDimensionRowDto[];
}

export class WebAnalyticsSourcesResponseDto {
  @Type(() => WebAnalyticsDimensionRowDto)
  referrers: WebAnalyticsDimensionRowDto[];

  @Type(() => WebAnalyticsDimensionRowDto)
  utm_sources: WebAnalyticsDimensionRowDto[];

  @Type(() => WebAnalyticsDimensionRowDto)
  utm_mediums: WebAnalyticsDimensionRowDto[];

  @Type(() => WebAnalyticsDimensionRowDto)
  utm_campaigns: WebAnalyticsDimensionRowDto[];
}

export class WebAnalyticsDevicesResponseDto {
  @Type(() => WebAnalyticsDimensionRowDto)
  device_types: WebAnalyticsDimensionRowDto[];

  @Type(() => WebAnalyticsDimensionRowDto)
  browsers: WebAnalyticsDimensionRowDto[];

  @Type(() => WebAnalyticsDimensionRowDto)
  oses: WebAnalyticsDimensionRowDto[];
}

export class WebAnalyticsGeographyResponseDto {
  @Type(() => WebAnalyticsDimensionRowDto)
  countries: WebAnalyticsDimensionRowDto[];

  @Type(() => WebAnalyticsDimensionRowDto)
  regions: WebAnalyticsDimensionRowDto[];

  @Type(() => WebAnalyticsDimensionRowDto)
  cities: WebAnalyticsDimensionRowDto[];
}
