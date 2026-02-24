import {
  IsString,
  IsNotEmpty,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { BaseAnalyticsQueryDto } from './shared/base-analytics-query.dto';

export class StickinessQueryDto extends BaseAnalyticsQueryDto {
  @IsString()
  @IsNotEmpty()
  target_event: string;

  @ApiProperty({ enum: ['day', 'week', 'month'], enumName: 'Granularity' })
  @IsIn(['day', 'week', 'month'])
  granularity: 'day' | 'week' | 'month';
}

export class StickinessDataPointDto {
  period_count: number;
  user_count: number;
}

export class StickinessResultDto {
  granularity: string;
  total_periods: number;
  @Type(() => StickinessDataPointDto)
  data: StickinessDataPointDto[];
}

export class StickinessResponseDto {
  @Type(() => StickinessResultDto)
  data: StickinessResultDto;
  cached_at: string;
  from_cache: boolean;
}
