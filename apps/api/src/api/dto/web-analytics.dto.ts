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
import { BaseAnalyticsResponseDto } from './shared/base-analytics-response.dto';

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

export class WebAnalyticsOverviewResponseDto extends BaseAnalyticsResponseDto {
  @Type(() => WebAnalyticsOverviewDataDto)
  data: WebAnalyticsOverviewDataDto;
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

export class WebAnalyticsPathsResponseDto extends BaseAnalyticsResponseDto {
  @Type(() => WebAnalyticsPathsDataDto)
  data: WebAnalyticsPathsDataDto;
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

export class WebAnalyticsSourcesResponseDto extends BaseAnalyticsResponseDto {
  @Type(() => WebAnalyticsSourcesDataDto)
  data: WebAnalyticsSourcesDataDto;
}

export class WebAnalyticsDevicesDataDto {
  @Type(() => WebAnalyticsDimensionRowDto)
  device_types: WebAnalyticsDimensionRowDto[];

  @Type(() => WebAnalyticsDimensionRowDto)
  browsers: WebAnalyticsDimensionRowDto[];

  @Type(() => WebAnalyticsDimensionRowDto)
  oses: WebAnalyticsDimensionRowDto[];
}

export class WebAnalyticsDevicesResponseDto extends BaseAnalyticsResponseDto {
  @Type(() => WebAnalyticsDevicesDataDto)
  data: WebAnalyticsDevicesDataDto;
}

export class WebAnalyticsGeographyDataDto {
  @Type(() => WebAnalyticsDimensionRowDto)
  countries: WebAnalyticsDimensionRowDto[];

  @Type(() => WebAnalyticsDimensionRowDto)
  regions: WebAnalyticsDimensionRowDto[];

  @Type(() => WebAnalyticsDimensionRowDto)
  cities: WebAnalyticsDimensionRowDto[];
}

export class WebAnalyticsGeographyResponseDto extends BaseAnalyticsResponseDto {
  @Type(() => WebAnalyticsGeographyDataDto)
  data: WebAnalyticsGeographyDataDto;
}
