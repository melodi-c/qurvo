import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StepFilterDto } from './shared/filters.dto';
import { makeJsonArrayTransform } from './shared/transforms';
import { BaseAnalyticsQueryDto } from './shared/base-analytics-query.dto';
import { BaseAnalyticsResponseDto } from './shared/base-analytics-response.dto';

export class StickinessQueryDto extends BaseAnalyticsQueryDto {
  @IsString()
  @IsNotEmpty()
  target_event: string;

  @ApiProperty({ enum: ['day', 'week', 'month'], enumName: 'Granularity' })
  @IsIn(['day', 'week', 'month'])
  granularity: 'day' | 'week' | 'month';

  @ApiPropertyOptional({ type: [StepFilterDto] })
  @IsOptional()
  @Transform(({ value, obj }) => {
    // Backward compat: accept legacy "event_filters" field
    const raw = value ?? obj?.event_filters;
    if (!raw) return undefined;
    return makeJsonArrayTransform(StepFilterDto)({ value: raw });
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StepFilterDto)
  filters?: StepFilterDto[];
}

export class StickinessDataPointDto {
  period_count: number;
  user_count: number;
}

export class StickinessResultDto {
  @ApiProperty({ enum: ['day', 'week', 'month'] })
  granularity: 'day' | 'week' | 'month';
  total_periods: number;
  @Type(() => StickinessDataPointDto)
  data: StickinessDataPointDto[];
}

export class StickinessResponseDto extends BaseAnalyticsResponseDto {
  @Type(() => StickinessResultDto)
  data: StickinessResultDto;
}
