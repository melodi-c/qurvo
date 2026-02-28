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

export class LifecycleQueryDto extends BaseAnalyticsQueryDto {
  @IsString()
  @IsNotEmpty()
  target_event: string;

  @ApiProperty({ enum: ['day', 'week', 'month'], enumName: 'Granularity' })
  @IsIn(['day', 'week', 'month'])
  granularity: 'day' | 'week' | 'month';

  @ApiPropertyOptional({ type: [StepFilterDto] })
  @IsOptional()
  @Transform(makeJsonArrayTransform(StepFilterDto))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StepFilterDto)
  event_filters?: StepFilterDto[];
}

export class LifecycleDataPointDto {
  bucket: string;
  new: number;
  returning: number;
  resurrecting: number;
  dormant: number;
}

export class LifecycleTotalsDto {
  new: number;
  returning: number;
  resurrecting: number;
  dormant: number;
}

export class LifecycleResultDto {
  @ApiProperty({ enum: ['day', 'week', 'month'] })
  granularity: 'day' | 'week' | 'month';
  @Type(() => LifecycleDataPointDto)
  data: LifecycleDataPointDto[];
  @Type(() => LifecycleTotalsDto)
  totals: LifecycleTotalsDto;
}

export class LifecycleResponseDto extends BaseAnalyticsResponseDto {
  @Type(() => LifecycleResultDto)
  data: LifecycleResultDto;
}
