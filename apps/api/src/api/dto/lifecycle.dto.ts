import {
  IsString,
  IsNotEmpty,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { BaseAnalyticsQueryDto } from './shared/base-analytics-query.dto';
import { BaseAnalyticsResponseDto } from './shared/base-analytics-response.dto';

export class LifecycleQueryDto extends BaseAnalyticsQueryDto {
  @IsString()
  @IsNotEmpty()
  target_event: string;

  @ApiProperty({ enum: ['day', 'week', 'month'], enumName: 'Granularity' })
  @IsIn(['day', 'week', 'month'])
  granularity: 'day' | 'week' | 'month';
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
