import {
  IsArray,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { StepFilterDto } from './shared/filters.dto';
import { parseJsonArray } from './shared/transforms';
import { CoreQueryDto } from './shared/base-analytics-query.dto';

export class WebAnalyticsQueryDto extends CoreQueryDto {
  @ApiPropertyOptional({ type: [StepFilterDto] })
  @Transform(parseJsonArray)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StepFilterDto)
  @IsOptional()
  filters?: StepFilterDto[];
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

export class WebAnalyticsOverviewDataDto {
  @Type(() => WebAnalyticsKPIsDto)
  current: WebAnalyticsKPIsDto;

  @Type(() => WebAnalyticsKPIsDto)
  previous: WebAnalyticsKPIsDto;

  @Type(() => WebAnalyticsTimeseriesPointDto)
  timeseries: WebAnalyticsTimeseriesPointDto[];

  granularity: string;
}

export class WebAnalyticsOverviewResponseDto {
  @Type(() => WebAnalyticsOverviewDataDto)
  data: WebAnalyticsOverviewDataDto;
  cached_at: string;
  from_cache: boolean;
}

export class WebAnalyticsDimensionRowDto {
  name: string;
  visitors: number;
  pageviews: number;
}

export class WebAnalyticsPathsDataDto {
  @Type(() => WebAnalyticsDimensionRowDto)
  top_pages: WebAnalyticsDimensionRowDto[];

  @Type(() => WebAnalyticsDimensionRowDto)
  entry_pages: WebAnalyticsDimensionRowDto[];

  @Type(() => WebAnalyticsDimensionRowDto)
  exit_pages: WebAnalyticsDimensionRowDto[];
}

export class WebAnalyticsPathsResponseDto {
  @Type(() => WebAnalyticsPathsDataDto)
  data: WebAnalyticsPathsDataDto;
  cached_at: string;
  from_cache: boolean;
}

export class WebAnalyticsSourcesDataDto {
  @Type(() => WebAnalyticsDimensionRowDto)
  referrers: WebAnalyticsDimensionRowDto[];

  @Type(() => WebAnalyticsDimensionRowDto)
  utm_sources: WebAnalyticsDimensionRowDto[];

  @Type(() => WebAnalyticsDimensionRowDto)
  utm_mediums: WebAnalyticsDimensionRowDto[];

  @Type(() => WebAnalyticsDimensionRowDto)
  utm_campaigns: WebAnalyticsDimensionRowDto[];
}

export class WebAnalyticsSourcesResponseDto {
  @Type(() => WebAnalyticsSourcesDataDto)
  data: WebAnalyticsSourcesDataDto;
  cached_at: string;
  from_cache: boolean;
}

export class WebAnalyticsDevicesDataDto {
  @Type(() => WebAnalyticsDimensionRowDto)
  device_types: WebAnalyticsDimensionRowDto[];

  @Type(() => WebAnalyticsDimensionRowDto)
  browsers: WebAnalyticsDimensionRowDto[];

  @Type(() => WebAnalyticsDimensionRowDto)
  oses: WebAnalyticsDimensionRowDto[];
}

export class WebAnalyticsDevicesResponseDto {
  @Type(() => WebAnalyticsDevicesDataDto)
  data: WebAnalyticsDevicesDataDto;
  cached_at: string;
  from_cache: boolean;
}

export class WebAnalyticsGeographyDataDto {
  @Type(() => WebAnalyticsDimensionRowDto)
  countries: WebAnalyticsDimensionRowDto[];

  @Type(() => WebAnalyticsDimensionRowDto)
  regions: WebAnalyticsDimensionRowDto[];

  @Type(() => WebAnalyticsDimensionRowDto)
  cities: WebAnalyticsDimensionRowDto[];
}

export class WebAnalyticsGeographyResponseDto {
  @Type(() => WebAnalyticsGeographyDataDto)
  data: WebAnalyticsGeographyDataDto;
  cached_at: string;
  from_cache: boolean;
}
