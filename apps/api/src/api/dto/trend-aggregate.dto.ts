import {
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StepFilterDto } from './shared/filters.dto';
import { makeJsonArrayTransform } from './shared/transforms';
import { BaseAnalyticsQueryDto } from './shared/base-analytics-query.dto';
import { BaseAnalyticsResponseDto } from './shared/base-analytics-response.dto';

const AGGREGATE_TYPES = ['world_map', 'calendar_heatmap'] as const;

export class TrendAggregateSeriesDto {
  @IsString()
  @IsNotEmpty()
  event_name: string;

  @IsString()
  @IsNotEmpty()
  label: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => StepFilterDto)
  filters?: StepFilterDto[];
}

export class TrendAggregateQueryDto extends BaseAnalyticsQueryDto {
  @ApiProperty({ enum: AGGREGATE_TYPES, enumName: 'AggregateType' })
  @IsIn(AGGREGATE_TYPES)
  aggregate_type: 'world_map' | 'calendar_heatmap';

  @Transform(makeJsonArrayTransform(TrendAggregateSeriesDto))
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => TrendAggregateSeriesDto)
  series: TrendAggregateSeriesDto[];
}

export class WorldMapRowDto {
  country: string;
  value: number;
}

export class HeatmapRowDto {
  hour_of_day: number;
  day_of_week: number;
  value: number;
}

export class TrendAggregateResultDto {
  @ApiProperty({ enum: AGGREGATE_TYPES, enumName: 'AggregateType' })
  type: 'world_map' | 'calendar_heatmap';

  @ApiPropertyOptional({ type: [WorldMapRowDto] })
  @Type(() => WorldMapRowDto)
  world_map?: WorldMapRowDto[];

  @ApiPropertyOptional({ type: [HeatmapRowDto] })
  @Type(() => HeatmapRowDto)
  heatmap?: HeatmapRowDto[];
}

export class TrendAggregateResponseDto extends BaseAnalyticsResponseDto {
  @ApiProperty({ type: TrendAggregateResultDto })
  @Type(() => TrendAggregateResultDto)
  data: TrendAggregateResultDto;
}
